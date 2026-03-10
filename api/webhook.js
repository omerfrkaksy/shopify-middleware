const SHOPPANEL_API = "https://shsbilisim.com/api/v1";
const SHOPPANEL_WEBHOOK = "https://shsbilisim.com/webhook.php?token=4d6b3e979850daf5354b790b419f7407f4d1490c6968163419372270323fa7a52";

const ILLER = {
  "adana":"Adana","adiyaman":"Adıyaman","afyon":"Afyonkarahisar","afyonkarahisar":"Afyonkarahisar",
  "agri":"Ağrı","amasya":"Amasya","ankara":"Ankara","antalya":"Antalya","artvin":"Artvin",
  "aydin":"Aydın","balikesir":"Balıkesir","bilecik":"Bilecik","bingol":"Bingöl","bitlis":"Bitlis",
  "bolu":"Bolu","burdur":"Burdur","bursa":"Bursa","canakkale":"Çanakkale","cankiri":"Çankırı",
  "corum":"Çorum","denizli":"Denizli","diyarbakir":"Diyarbakır","edirne":"Edirne",
  "elazig":"Elazığ","erzincan":"Erzincan","erzurum":"Erzurum","eskisehir":"Eskişehir",
  "gaziantep":"Gaziantep","giresun":"Giresun","gumushane":"Gümüşhane","hakkari":"Hakkari",
  "hatay":"Hatay","isparta":"Isparta","mersin":"Mersin","icel":"Mersin",
  "istanbul":"İstanbul","ist":"İstanbul","stanbul":"İstanbul","istanbu":"İstanbul",
  "izmir":"İzmir","izmır":"İzmir","kars":"Kars","kastamonu":"Kastamonu",
  "kayseri":"Kayseri","kirklareli":"Kırklareli","kirsehir":"Kırşehir","kocaeli":"Kocaeli",
  "izmit":"Kocaeli","konya":"Konya","kutahya":"Kütahya","malatya":"Malatya","manisa":"Manisa",
  "kahramanmaras":"Kahramanmaraş","maras":"Kahramanmaraş","mardin":"Mardin","mugla":"Muğla",
  "mus":"Muş","nevsehir":"Nevşehir","nigde":"Niğde","ordu":"Ordu","rize":"Rize",
  "sakarya":"Sakarya","samsun":"Samsun","siirt":"Siirt","sinop":"Sinop","sivas":"Sivas",
  "tekirdag":"Tekirdağ","tokat":"Tokat","trabzon":"Trabzon","tunceli":"Tunceli",
  "sanliurfa":"Şanlıurfa","urfa":"Şanlıurfa","usak":"Uşak","van":"Van","yozgat":"Yozgat",
  "zonguldak":"Zonguldak","aksaray":"Aksaray","bayburt":"Bayburt","karaman":"Karaman",
  "kirikkale":"Kırıkkale","batman":"Batman","sirnak":"Şırnak","bartin":"Bartın",
  "ardahan":"Ardahan","igdir":"Iğdır","yalova":"Yalova","karabuk":"Karabük",
  "kilis":"Kilis","osmaniye":"Osmaniye","duzce":"Düzce"
};

function normalize(str) {
  if (!str) return "";
  return str.toLowerCase().trim()
    .replace(/ı/g,"i").replace(/ğ/g,"g").replace(/ü/g,"u")
    .replace(/ş/g,"s").replace(/ö/g,"o").replace(/ç/g,"c")
    .replace(/â/g,"a").replace(/î/g,"i").replace(/û/g,"u")
    .replace(/[^a-z0-9]/g,"");
}

function fixProvince(raw) {
  if (!raw) return "";
  var key = normalize(raw);
  if (ILLER[key]) return ILLER[key];
  for (var k in ILLER) {
    if (key.includes(k) || k.includes(key)) return ILLER[k];
  }
  return raw;
}

function findProvinceFromAddress(address) {
  if (!address) return null;
  var norm = normalize(address);
  var keys = Object.keys(ILLER).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    if (norm.includes(keys[i])) return ILLER[keys[i]];
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    var order = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!order || !order.id) {
      return res.status(200).json({ skipped: true, reason: "Gecersiz veri" });
    }

    var addr = order.shipping_address;
    if (!addr) {
      // Adres yoksa direkt webhook'a ilet
      await forwardToWebhook(req, order);
      return res.status(200).json({ success: true, method: "webhook-no-address" });
    }

    // IL DUZELTME
    var origProvince = addr.province || "";
    var origCity = addr.city || "";
    var fixedProvince = fixProvince(origProvince);

    // Province bos veya bulunamadiysa city'den dene
    if (!ILLER[normalize(fixedProvince)]) {
      var fromCity = fixProvince(origCity);
      if (ILLER[normalize(fromCity)]) {
        fixedProvince = fromCity;
      }
    }

    // Hala bulunamadiysa adres metninden ara
    if (!ILLER[normalize(fixedProvince)]) {
      var fullText = [addr.address1, addr.address2, origCity, origProvince].join(" ");
      var found = findProvinceFromAddress(fullText);
      if (found) fixedProvince = found;
    }

    // ILCE DUZELTME - city aslinda il ise swap yap
    var fixedCity = origCity;
    if (ILLER[normalize(origCity)] && !ILLER[normalize(origProvince)]) {
      fixedProvince = ILLER[normalize(origCity)];
      fixedCity = origProvince;
    }

    // Il ve ilce ayni ise ilceyi address2'den al
    if (normalize(fixedProvince) === normalize(fixedCity) && addr.address2) {
      fixedCity = addr.address2;
    }

    var needsFix = (fixedProvince !== origProvince) || (fixedCity !== origCity);

    console.log("Siparis:", order.name, "| Il:", origProvince, "->", fixedProvince, "| Ilce:", origCity, "->", fixedCity, "| Duzeltme:", needsFix);

    if (!needsFix || ILLER[normalize(origProvince)]) {
      // Duzeltme gerekmiyorsa veya il zaten dogru ise webhook ile gonder
      await forwardToWebhook(req, order);
      return res.status(200).json({ success: true, method: "webhook-no-fix-needed" });
    }

    // DUZELTME GEREKIYOR - ShopPanel API ile siparis olustur
    var APIKEY = process.env.SHOPPANEL_API_KEY;

    var phone = addr.phone || order.phone || "";
    phone = phone.replace(/\s+/g,"").replace(/[^0-9+]/g,"");
    if (phone.startsWith("+90")) phone = "0" + phone.slice(3);
    if (!phone.startsWith("0") && phone.length === 10) phone = "0" + phone;

    var customerName = (addr.first_name || "") + " " + (addr.last_name || "");
    customerName = customerName.trim() || "Musteri";

    // Odeme durumu
    var gateway = (order.gateway || "").toLowerCase();
    var financialStatus = order.financial_status || "";
    var isCOD = gateway.includes("cash") || gateway.includes("cod") || gateway.includes("kapida") || gateway.includes("manual") || financialStatus === "pending";

    var orderData = {
      external_order_id: String(order.id),
      source: "api",
      customer: {
        first_name: addr.first_name || order.customer?.first_name || "Musteri",
        last_name: addr.last_name || order.customer?.last_name || "",
        phone: phone
      },
      shipping_address: {
        first_name: addr.first_name || "",
        last_name: addr.last_name || "",
        address1: addr.address1 || "",
        address2: addr.address2 || "",
        city: fixedCity,
        province: fixedProvince,
        zip: addr.zip || "",
        phone: phone
      },
      line_items: (order.line_items || []).map(function(item) {
        return {
          title: item.title || "Urun",
          variant_title: item.variant_title || "",
          sku: item.sku || "",
          quantity: item.quantity || 1,
          price: parseFloat(item.price) || 0
        };
      }),
      total_price: parseFloat(order.total_price) || 0,
      financial_status: isCOD ? "pending" : "paid",
      note: "Shopify #" + (order.name || order.order_number || order.id)
    };

    console.log("ShopPanel API ile siparis olusturuluyor:", orderData.note);

    var apiResponse = await fetch(SHOPPANEL_API + "/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + APIKEY
      },
      body: JSON.stringify(orderData)
    });

    var apiResult = await apiResponse.text();
    console.log("ShopPanel API yanit:", apiResponse.status, apiResult.substring(0, 500));

    // Eger API 409 (duplicate) dondururse, siparis zaten var demek - sorun yok
    if (apiResponse.status === 409) {
      console.log("Siparis zaten mevcut, atlanıyor");
      return res.status(200).json({ success: true, method: "api-duplicate" });
    }

    return res.status(200).json({
      success: apiResponse.ok,
      method: "api",
      shoppanelStatus: apiResponse.status
    });

  } catch (err) {
    console.error("Middleware hatasi:", err);
    return res.status(200).json({ success: false, error: err.message });
  }
}

// Orijinal webhook'a iletme (duzeltme gerekmeyenler icin)
async function forwardToWebhook(req, order) {
  var headers = { "Content-Type": "application/json" };
  var shopifyHeaders = [
    "x-shopify-topic", "x-shopify-shop-domain", "x-shopify-hmac-sha256",
    "x-shopify-api-version", "x-shopify-webhook-id"
  ];
  for (var i = 0; i < shopifyHeaders.length; i++) {
    if (req.headers[shopifyHeaders[i]]) {
      headers[shopifyHeaders[i]] = req.headers[shopifyHeaders[i]];
    }
  }

  await fetch(SHOPPANEL_WEBHOOK, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(order)
  });
}

export const config = {
  api: { bodyParser: true }
};

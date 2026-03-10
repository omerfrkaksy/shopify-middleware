const SHOPPANEL_URL = "https://shsbilisim.com/webhook.php?token=4d6b3e979850daf5354b790b419f7407f4d1490c6968163419372270323fa7a52";

const ILLER = {
  "adana":"Adana","adiyaman":"Adıyaman","afyon":"Afyonkarahisar","afyonkarahisar":"Afyonkarahisar",
  "agri":"Ağrı","amasya":"Amasya","ankara":"Ankara","antalya":"Antalya","artvin":"Artvin",
  "aydin":"Aydın","balikesir":"Balıkesir","bilecik":"Bilecik","bingol":"Bingöl","bitlis":"Bitlis",
  "bolu":"Bolu","burdur":"Burdur","bursa":"Bursa","canakkale":"Çanakkale","cankiri":"Çankırı",
  "corum":"Çorum","denizli":"Denizli","diyarbakir":"Diyarbakır","edirne":"Edirne",
  "elazig":"Elazığ","erzincan":"Erzincan","erzurum":"Erzurum","eskisehir":"Eskişehir",
  "gaziantep":"Gaziantep","giresun":"Giresun","gumushane":"Gümüşhane","hakkari":"Hakkari",
  "hatay":"Hatay","isparta":"Isparta","mersin":"Mersin","icel":"Mersin",
  "istanbul":"İstanbul","ist":"İstanbul","izmir":"İzmir","kars":"Kars","kastamonu":"Kastamonu",
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

function fixAddress(addr) {
  if (!addr) return addr;

  var originalProvince = addr.province || "";
  var originalCity = addr.city || "";

  // Province (Il) duzelt
  var fixedProvince = fixProvince(addr.province);

  if (!fixedProvince || !ILLER[normalize(fixedProvince)]) {
    var fromCity = fixProvince(addr.city);
    if (fromCity && ILLER[normalize(fromCity)]) fixedProvince = fromCity;
  }

  if (!fixedProvince || !ILLER[normalize(fixedProvince)]) {
    var fullAddr = [addr.address1, addr.address2, addr.city, addr.province].join(" ");
    var found = findProvinceFromAddress(fullAddr);
    if (found) fixedProvince = found;
  }

  // City (Ilce) duzelt
  var fixedCity = addr.city || "";

  if (ILLER[normalize(fixedCity)] && !ILLER[normalize(originalProvince)]) {
    fixedProvince = ILLER[normalize(fixedCity)];
    fixedCity = originalProvince || "";
  }

  if (normalize(fixedProvince) === normalize(fixedCity)) {
    if (addr.address2) fixedCity = addr.address2;
  }

  addr.province = fixedProvince;
  addr.city = fixedCity;
  if (fixedProvince) addr.province_code = fixedProvince;

  return addr;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Ham body'yi al
    var rawBody;
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else {
      rawBody = JSON.stringify(req.body);
    }

    var order = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!order) {
      return res.status(400).json({ error: "Bos veri" });
    }

    // Adres duzeltme
    if (order.shipping_address) {
      var origP = order.shipping_address.province;
      var origC = order.shipping_address.city;
      order.shipping_address = fixAddress(order.shipping_address);
      console.log("Adres duzeltme:", {
        orderId: order.id, name: order.name,
        onceki: { province: origP, city: origC },
        sonraki: { province: order.shipping_address.province, city: order.shipping_address.city }
      });
    }

    if (order.billing_address) {
      order.billing_address = fixAddress(order.billing_address);
    }

    // Shopify HMAC headerlarini ShopPanel'e ilet
    var headers = { "Content-Type": "application/json" };

    // Orijinal Shopify headerlarini kopyala
    var shopifyHeaders = [
      "x-shopify-topic",
      "x-shopify-shop-domain",
      "x-shopify-hmac-sha256",
      "x-shopify-api-version",
      "x-shopify-webhook-id"
    ];

    for (var i = 0; i < shopifyHeaders.length; i++) {
      var hName = shopifyHeaders[i];
      if (req.headers[hName]) {
        headers[hName] = req.headers[hName];
      }
    }

    // ShopPanel'e ilet
    var response = await fetch(SHOPPANEL_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(order)
    });

    var responseText = await response.text();
    console.log("ShopPanel yanit:", { status: response.status, body: responseText.substring(0, 500) });

    return res.status(200).json({ success: true, shoppanelStatus: response.status });

  } catch (err) {
    console.error("Middleware hatasi:", err);
    return res.status(200).json({ success: false, error: err.message });
  }
}

export const config = {
  api: { bodyParser: true }
};

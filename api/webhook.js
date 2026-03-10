const SHOPPANEL_URL = "https://shsbilisim.com/webhook.php?token=4d6b3e979850daf5354b790b419f7407f4d1490c6968163419372270323fa7a52";

// Turkiye il listesi - normalize edilmis hali ve resmi adi
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

// Turkce karakterleri temizle
function normalize(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

// Il adini duzelt
function fixProvince(raw) {
  if (!raw) return "";
  var key = normalize(raw);
  if (ILLER[key]) return ILLER[key];

  // Fuzzy match - il adi iceride geciyorsa
  for (var k in ILLER) {
    if (key.includes(k) || k.includes(key)) {
      return ILLER[k];
    }
  }
  return raw; // bulamazsa orijinali dondur
}

// Adres metninden il bulmaya calis
function findProvinceFromAddress(address) {
  if (!address) return null;
  var norm = normalize(address);

  // Uzun illerden kisa illere dogru ara (oncelik uzun olanlarda)
  var keys = Object.keys(ILLER).sort(function(a, b) { return b.length - a.length; });
  for (var i = 0; i < keys.length; i++) {
    if (norm.includes(keys[i])) {
      return ILLER[keys[i]];
    }
  }
  return null;
}

export default async function handler(req, res) {
  // Sadece POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    var order = req.body;
    if (!order) {
      return res.status(400).json({ error: "Bos veri" });
    }

    // shipping_address varsa duzelt
    if (order.shipping_address) {
      var addr = order.shipping_address;
      var originalProvince = addr.province || "";
      var originalCity = addr.city || "";

      // 1. Province (Il) duzeltme
      var fixedProvince = fixProvince(addr.province);

      // Province bos veya bulunamadiysa city'den dene
      if (!fixedProvince || fixedProvince === addr.province) {
        var fromCity = fixProvince(addr.city);
        if (fromCity && ILLER[normalize(fromCity)]) {
          fixedProvince = fromCity;
        }
      }

      // Hala bos ise adres metninden bul
      if (!fixedProvince || !ILLER[normalize(fixedProvince)]) {
        var fullAddr = [addr.address1, addr.address2, addr.city, addr.province].join(" ");
        var found = findProvinceFromAddress(fullAddr);
        if (found) fixedProvince = found;
      }

      // 2. City (Ilce) duzeltme
      var fixedCity = addr.city || "";

      // Eger city aslinda bir il adiysa ve province bossa, swap yap
      if (ILLER[normalize(fixedCity)] && !ILLER[normalize(originalProvince)]) {
        // city aslinda il, province aslinda ilce
        fixedProvince = ILLER[normalize(fixedCity)];
        fixedCity = originalProvince || "";
      }

      // Province ve city ayni ise, city'yi address2'den almaya calis
      if (normalize(fixedProvince) === normalize(fixedCity)) {
        if (addr.address2) {
          fixedCity = addr.address2;
        }
      }

      // Guncelle
      order.shipping_address.province = fixedProvince;
      order.shipping_address.city = fixedCity;

      // province_code da guncelle (ShopPanel bunu kullanabilir)
      if (fixedProvince) {
        order.shipping_address.province_code = fixedProvince;
      }

      console.log("Adres duzeltme:", {
        orderId: order.id,
        orderName: order.name,
        onceki: { province: originalProvince, city: originalCity },
        sonraki: { province: fixedProvince, city: fixedCity }
      });
    }

    // billing_address icin de ayni islemi yap
    if (order.billing_address) {
      var baddr = order.billing_address;
      var bFixedProvince = fixProvince(baddr.province);

      if (!bFixedProvince || !ILLER[normalize(bFixedProvince)]) {
        var bFromCity = fixProvince(baddr.city);
        if (bFromCity && ILLER[normalize(bFromCity)]) {
          bFixedProvince = bFromCity;
        }
      }

      if (bFixedProvince) order.billing_address.province = bFixedProvince;
      if (bFixedProvince) order.billing_address.province_code = bFixedProvince;

      if (ILLER[normalize(baddr.city)] && !ILLER[normalize(baddr.province)]) {
        order.billing_address.province = ILLER[normalize(baddr.city)];
        order.billing_address.city = baddr.province || "";
      }
    }

    // ShopPanel'e ilet
    var response = await fetch(SHOPPANEL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(order)
    });

    var responseText = await response.text();

    console.log("ShopPanel yanit:", {
      status: response.status,
      body: responseText.substring(0, 500)
    });

    // Shopify'a 200 don (tekrar denemesin)
    return res.status(200).json({
      success: true,
      shoppanelStatus: response.status
    });

  } catch (err) {
    console.error("Middleware hatasi:", err);
    return res.status(200).json({ success: false, error: err.message });
  }
}

export const config = {
  api: { bodyParser: true }
};

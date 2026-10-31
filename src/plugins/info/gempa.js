import { safeFetch } from "../../function.js";

const BMKG_BASE_URL = "https://data.bmkg.go.id/DataMKG/TEWS";

const fetchLatestEarthquake = async (signal) => {
  const response = await safeFetch(
    `${BMKG_BASE_URL}/autogempa.json`,
    {
      method: "GET",
      signal,
      headers: {
        "Accept": "application/json"
      }
    },
    12000
  );

  if (!response.ok) {
    throw new Error(`Server BMKG merespons dengan status ${response.status}`);
  }

  const payload = await response.json();
  const gempa = payload?.Infogempa?.gempa;

  if (!gempa) {
    throw new Error("Data gempa tidak tersedia dari sumber BMKG saat ini");
  }

  return {
    tanggal: gempa.Tanggal,
    jam: gempa.Jam,
    datetime: gempa.DateTime,
    magnitudo: gempa.Magnitude,
    kedalaman: gempa.Kedalaman,
    koordinat: {
      garis_lintang: gempa.Lintang,
      garis_bujur: gempa.Bujur,
      point: gempa.Coordinates
    },
    wilayah: gempa.Wilayah,
    potensi: gempa.Potensi,
    dirasakan: gempa.Dirasakan || "-",
    shakemap: gempa.Shakemap ? `${BMKG_BASE_URL}/${gempa.Shakemap}` : null
  };
};

const run = async (req, res, { signal }) => {
  return await fetchLatestEarthquake(signal);
};

const plugin = {
  run,
  name: "gempa",
  categories: ["info"],
  description: "Informasi gempa bumi terkini beserta peta guncangan dari BMKG",
  method: ["GET"],
  params: {},
  cache: 60,
  timeout: 15000
};

export default plugin;
export default {
  name: "Gempa Terkini",
  category: "info",
  description: "Menampilkan data gempa bumi terbaru secara real-time dari BMKG",
  method: ["GET"],
  params: {},
  execute: async () => {
    const response = await fetch("https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json");

    if (!response.ok) {
      throw new Error("Gagal mengambil data dari server BMKG");
    }

    const json = await response.json();
    const gempa = json.Infogempa?.gempa;

    if (!gempa) {
      throw new Error("Data gempa tidak ditemukan");
    }

    return {
      tanggal: gempa.Tanggal,
      jam: gempa.Jam,
      datetime: gempa.DateTime,
      coordinates: gempa.Coordinates,
      lintang: gempa.Lintang,
      bujur: gempa.Bujur,
      magnitude: gempa.Magnitude,
      kedalaman: gempa.Kedalaman,
      wilayah: gempa.Wilayah,
      potensi: gempa.Potensi,
      dirasakan: gempa.Dirasakan,
      shakemap: `https://data.bmkg.go.id/DataMKG/TEWS/${gempa.Shakemap}`
    };
  }
};
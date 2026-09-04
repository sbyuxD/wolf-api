import { safeFetch } from "../../function.js";

const BASE_URL = "https://tempmail-backend.hasnaintariq142.workers.dev";
const HEADERS = {
  "Referer": "https://tempmail.chat/",
  "Origin": "https://tempmail.chat",
  "Content-Type": "application/json"
};

const cleanHtmlWithLinks = (html) => {
  if (!html) return { text: "", links: [] };

  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<(meta|link|img)\b[^>]*>/gi, "");

  const links = [];
  const linkRegex = /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(cleaned)) !== null) {
    const url = match[1];
    const rawText = match[2].replace(/<[^>]+>/g, "").trim();
    links.push({ text: rawText || "Link", url });
  }

  cleaned = cleaned.replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gi, (_, url, innerText) => {
    const text = innerText.replace(/<[^>]+>/g, "").trim() || "Link";
    return `\n${text}: ${url}\n`;
  });

  cleaned = cleaned
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  const unescaped = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  const finalText = unescaped.replace(/\n\s*\n+/g, "\n\n").trim();

  return { text: finalText, links };
};

export default {
  name: "Temp Mail Generator & Inbox",
  category: "tools",
  description: "Membuat email sementara baru atau membaca pesan masuk menggunakan token",
  method: ["GET", "POST"],
  params: {
    token: {
      type: "string",
      required: false,
      description: "Token akses inbox untuk mengecek pesan masuk (kosongkan jika ingin membuat email baru)"
    }
  },
  execute: async (req, res, { input }) => {
    const { token } = input;

    if (!token) {
      const response = await safeFetch(`${BASE_URL}/api/create-inbox`, {
        method: "POST",
        headers: HEADERS
      }, 15000);

      if (!response.ok) {
        throw new Error(`Gagal membuat inbox tempmail (${response.status})`);
      }

      const data = await response.json();

      if (!data.success || !data.email) {
        throw new Error("Respon server tidak valid saat membuat inbox");
      }

      return {
        action: "create_inbox",
        email: data.email,
        token: data.access_token,
        usage: `Gunakan parameter 'token=${data.access_token}' pada endpoint ini untuk mengecek pesan masuk`
      };
    }

    const response = await safeFetch(`${BASE_URL}/api/inbox?token=${encodeURIComponent(token)}`, {
      method: "GET",
      headers: HEADERS
    }, 15000);

    if (!response.ok) {
      throw new Error(`Gagal memeriksa inbox (${response.status})`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error("Token tidak valid atau telah kedaluwarsa");
    }

    const rawMessages = data.messages || [];

    const messages = rawMessages.map((msg) => {
      const { text, links } = cleanHtmlWithLinks(msg.html_body);

      return {
        id: msg.id,
        sender: msg.sender,
        sender_name: msg.sender_name || msg.sender,
        subject: msg.subject,
        received_at: msg.received_at,
        body_text: text,
        links: links
      };
    });

    return {
      action: "check_inbox",
      total_messages: messages.length,
      messages
    };
  }
};
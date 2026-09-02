import { safeFetch } from "../../function.js";

const extractHashtags = (text) => {
  if (!text) return [];
  const matches = text.match(/#[\w\u0590-\u05ff]+/gi) || [];
  return [...new Set(matches)];
};

export default {
  name: "CapCut Downloader",
  category: "downloader",
  description: "Download video template and extract metadata from CapCut",
  method: ["GET", "POST"],
  params: {
    url: {
      type: "string",
      required: true,
      description: "CapCut template URL"
    }
  },
  execute: async (req) => {
    const inputUrl = req.query.url || req.body?.url;

    if (!inputUrl || !inputUrl.includes("capcut.com")) {
      throw new Error("URL CapCut tidak valid (contoh: https://www.capcut.com/tv2/ZSVEwBgtH/)");
    }

    const response = await safeFetch(inputUrl, {
      headers: {
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      },
      redirect: "follow"
    }, 15000);

    if (!response.ok) {
      throw new Error(`Gagal mengakses server CapCut (Status: ${response.status})`);
    }

    const html = await response.text();
    let templateData = null;
    let loaderObj = null;

    const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
    for (const s of scripts) {
      if (s[1].includes("loaderData")) {
        try {
          const parsed = JSON.parse(s[1]);
          loaderObj = parsed.loaderData?.["template-detail_$"] || parsed.loaderData?.["template_detail"];
          if (loaderObj?.templateDetail) {
            templateData = loaderObj.templateDetail;
            break;
          }
        } catch (_) {}
      }
    }

    if (!templateData) {
      const getRegex = (re) => html.match(re)?.[1]?.replace(/\\u002F/g, "/") ?? "";
      const getNum = (re) => parseInt(html.match(re)?.[1] || "0", 10);

      const videoUrl = getRegex(/"videoUrl":"(.*?)"/);
      if (!videoUrl) {
        throw new Error("Gagal mengekstrak metadata dari URL CapCut");
      }

      const coverUrl = getRegex(/"coverUrl":"(.*?)"/);
      const title = getRegex(/"title":"(.*?)"/);
      const desc = getRegex(/"desc":"(.*?)"/);
      const templateId = getRegex(/"templateId":"(.*?)"/);
      const width = getNum(/"videoWidth":([0-9]+)/);
      const height = getNum(/"videoHeight":([0-9]+)/);
      const duration = getNum(/"templateDuration":([0-9]+)/);
      const createTime = getNum(/"createTime":([0-9]+)/);

      return {
        id: templateId,
        title: title || "CapCut Template",
        description: desc,
        hashtags: extractHashtags(desc),
        cover_url: coverUrl,
        video_url: videoUrl,
        width,
        height,
        ratio: width && height ? `${width}:${height}` : "9:16",
        duration_ms: duration,
        duration_sec: Number((duration / 1000).toFixed(2)),
        usage_count: getNum(/"usageAmount":([0-9]+)/),
        like_count: getNum(/"likeAmount":([0-9]+)/) || getNum(/"likeCount":([0-9]+)/),
        play_count: getNum(/"playAmount":([0-9]+)/) || getNum(/"playCount":([0-9]+)/),
        comment_count: getNum(/"commentAmount":([0-9]+)/),
        created_at: createTime ? new Date(createTime * 1000).toISOString() : "",
        author: {
          name: getRegex(/"author":\{.*?"name":"(.*?)"/),
          avatar_url: getRegex(/"avatarUrl":"(.*?)"/)
        },
        original_url: inputUrl
      };
    }

    const createTime = Number(templateData.createTime || 0);
    const duration = Number(templateData.templateDuration || 0);
    const desc = templateData.desc || "";

    const rawRecommend = Array.isArray(loaderObj?.recommendList) ? loaderObj.recommendList : [];
    const recommendList = rawRecommend.map((item) => {
      const itemCreateTime = Number(item.createTime || 0);
      const hasAuthor = Boolean(item.author?.name || item.author?.avatarUrl || item.author?.secUid);

      return {
        id: String(item.templateId || ""),
        title: item.title || "",
        cover_url: item.coverUrl || "",
        video_url: item.videoUrl || null,
        usage_count: Number(item.usageAmount || 0),
        like_count: Number(item.likeAmount || 0),
        created_at: itemCreateTime ? new Date(itemCreateTime * 1000).toISOString() : null,
        author: hasAuthor ? {
          name: item.author?.name || null,
          avatar_url: item.author?.avatarUrl || null
        } : null
      };
    });

    return {
      id: String(templateData.templateId || loaderObj?.templateId || ""),
      title: templateData.title || "",
      description: desc,
      hashtags: extractHashtags(desc),
      tag_title: templateData.tagTitle || "",
      canonical_url: loaderObj?.canonicalPath ? `https://www.capcut.com${loaderObj.canonicalPath}` : (templateData.structuredData?.url || ""),
      cover_url: templateData.coverUrl || "",
      video_url: templateData.videoUrl || "",
      width: Number(templateData.videoWidth || 0),
      height: Number(templateData.videoHeight || 0),
      ratio: templateData.videoRatio || (templateData.videoWidth && templateData.videoHeight ? `${templateData.videoWidth}:${templateData.videoHeight}` : "9:16"),
      duration_ms: duration,
      duration_sec: Number((duration / 1000).toFixed(2)),
      segment_count: Number(templateData.segmentAmount || 0),
      usage_count: Number(templateData.usageAmount || 0),
      like_count: Number(templateData.likeAmount || 0),
      play_count: Number(templateData.playAmount || 0),
      comment_count: Number(templateData.commentAmount || 0),
      created_at: createTime ? new Date(createTime * 1000).toISOString() : "",
      capabilities: Array.isArray(templateData.capabilityName) ? templateData.capabilityName : [],
      author: {
        name: templateData.author?.name || "",
        avatar_url: templateData.author?.avatarUrl || "",
        description: templateData.author?.description || "",
        profile_url: templateData.author?.profileUrl ? `https://www.capcut.com${templateData.author.profileUrl}` : "",
        sec_uid: templateData.author?.secUid || ""
      },
      recommend_list: recommendList.length > 0 ? recommendList : [],
      original_url: inputUrl
    };
  }
};
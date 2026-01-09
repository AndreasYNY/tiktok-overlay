(() => {
  const PROFILE_REGEX = /{"userInfo":.*?}(?=,"webapp)/;
  const VIDEO_REGEX = /"webapp\.video-detail":.*?}(?=,"webapp)/;
  const LOG_PREFIX = "[TikTok Detail Parser]";
  let lastMatch = null;
  let lastUrl = location.href;
  let overlay = null;
  let scheduled = false;
  let retryTimer = null;
  let retryUntil = 0;
  let fetchController = null;

  const ensureOverlay = () => {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "tiktok-detail-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "12px";
    overlay.style.right = "12px";
    overlay.style.zIndex = "999999";
    overlay.style.background = "rgba(0, 0, 0, 0.75)";
    overlay.style.color = "#fff";
    overlay.style.padding = "10px 12px";
    overlay.style.borderRadius = "8px";
    overlay.style.font = "12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace";
    overlay.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.35)";
    overlay.style.pointerEvents = "auto";
    overlay.style.userSelect = "text";
    document.documentElement?.appendChild(overlay);
    return overlay;
  };

  const renderOverlayProfile = (data) => {
    const user = data?.userInfo?.user || {};
    const stats = data?.userInfo?.stats || {};
    const lines = [
      `type: profile`,
      `tiktok_id: ${user.id || "-"}`,
      `followers: ${stats.followerCount ?? "-"}`,
      `following: ${stats.followingCount ?? "-"}`,
      `likes: ${stats.heartCount ?? stats.heart ?? "-"}`,
      `videos: ${stats.videoCount ?? "-"}`
    ];
    ensureOverlay().textContent = lines.join(" | ");
  };

  const renderOverlayVideo = (data) => {
    const item = data?.itemInfo?.itemStruct || {};
    const author = item?.author || {};
    const stats = item?.stats || {};
    const lines = [
      `type: video`,
      `video_id: ${item.id || "-"}`,
      `author_id: ${author.id || "-"}`,
      `author_uid: ${author.uniqueId || "-"}`,
      `views: ${stats.playCount ?? "-"}`,
      `likes: ${stats.diggCount ?? "-"}`,
      `comments: ${stats.commentCount ?? "-"}`,
      `shares: ${stats.shareCount ?? "-"}`
    ];
    ensureOverlay().textContent = lines.join(" | ");
  };

  const isVideoOrPhotoPage = () => {
    return location.pathname.includes("/video/") || location.pathname.includes("/photo/");
  };

  const getMatch = () => {
    const regex = isVideoOrPhotoPage() ? VIDEO_REGEX : PROFILE_REGEX;
    const html = document.documentElement?.innerHTML || "";
    let match = html.match(regex)?.pop() || null;

    if (!match) {
      const state =
        window.__UNIVERSAL_DATA_FOR_REHYDRATION__ ||
        window.SIGI_STATE ||
        window.__NEXT_DATA__ ||
        null;
      if (state) {
        try {
          const stateText = JSON.stringify(state);
          match = stateText.match(regex)?.pop() || null;
        } catch (error) {
          console.warn(LOG_PREFIX, "failed to stringify state", error);
        }
      }
    }

    return match;
  };

  const startRetryWindow = () => {
    retryUntil = Date.now() + 8000;
    if (retryTimer) return;
    retryTimer = setInterval(() => {
      if (Date.now() > retryUntil) {
        clearInterval(retryTimer);
        retryTimer = null;
        return;
      }
      scheduleParse();
    }, 500);
  };

  const handleUrlChange = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    lastMatch = null;
    scheduleParse();
    startRetryWindow();
    fetchPageAndParse();
  };

  const fetchPageAndParse = async () => {
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();
    try {
      const response = await fetch(location.href, {
        credentials: "include",
        cache: "no-store",
        signal: fetchController.signal
      });
      if (!response.ok) return;
      const html = await response.text();
      const regex = isVideoOrPhotoPage() ? VIDEO_REGEX : PROFILE_REGEX;
      const match = html.match(regex)?.pop() || null;
      if (match && match !== lastMatch) {
        lastMatch = match;
        window.__tiktok_webapp_video_detail = match;
        console.log(LOG_PREFIX, "matched payload (fetch)", match);
        document.documentElement?.setAttribute("data-tiktok-video-detail", "true");
        try {
          if (isVideoOrPhotoPage()) {
            const data = JSON.parse(`{${match}}`)["webapp.video-detail"];
            renderOverlayVideo(data);
          } else {
            const data = JSON.parse(match);
            renderOverlayProfile(data);
          }
        } catch (error) {
          console.warn(LOG_PREFIX, "failed to parse fetched payload", error);
        }
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.warn(LOG_PREFIX, "failed to fetch page", error);
      }
    }
  };

  const parseHtml = () => {
    scheduled = false;
    const match = getMatch();

    if (match && match !== lastMatch) {
      lastMatch = match;
      window.__tiktok_webapp_video_detail = match;
      console.log(LOG_PREFIX, "matched payload", match);
      document.documentElement?.setAttribute("data-tiktok-video-detail", "true");
      try {
        if (isVideoOrPhotoPage()) {
          const data = JSON.parse(`{${match}}`)["webapp.video-detail"];
          renderOverlayVideo(data);
        } else {
          const data = JSON.parse(match);
          renderOverlayProfile(data);
        }
      } catch (error) {
        console.warn(LOG_PREFIX, "failed to parse payload", error);
      }
    }
  };

  const scheduleParse = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(parseHtml);
  };

  const observer = new MutationObserver(scheduleParse);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  const notifyLocationChange = () => {
    window.dispatchEvent(new Event("tiktok:locationchange"));
  };

  const wrapHistory = (method) => {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      notifyLocationChange();
      return result;
    };
  };

  wrapHistory("pushState");
  wrapHistory("replaceState");
  window.addEventListener("popstate", notifyLocationChange);
  window.addEventListener("tiktok:locationchange", handleUrlChange);

  setInterval(handleUrlChange, 1000);

  scheduleParse();
})();

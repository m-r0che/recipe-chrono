export function listenForCookCommands(onCommand) {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) return { stop() {}, available: false };

  const rec = new Speech();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = "en-GB";

  rec.onresult = (event) => {
    const last = event.results[event.results.length - 1];
    const said = (last?.[0]?.transcript ?? "").toLowerCase();
    if (/\b(next|continue|go)\b/.test(said)) onCommand("next");
    else if (/\b(skip|skip it)\b/.test(said)) onCommand("skip");
    else if (/\b(repeat|again|back)\b/.test(said)) onCommand("repeat");
  };

  rec.onerror = () => {};
  rec.onend = () => {
    try {
      rec.start();
    } catch {
    }
  };

  try {
    rec.start();
  } catch {
    return { stop() {}, available: false };
  }

  return {
    available: true,
    stop() {
      rec.onend = null;
      rec.stop();
    },
  };
}

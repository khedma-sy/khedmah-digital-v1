export function playOrderRing() {
  try {
    const RuntimeAudioContext =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!RuntimeAudioContext) return;
    const context = new RuntimeAudioContext();
    const start = context.currentTime;
    [0, 0.28, 0.56].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        offset === 0.28 ? 880 : 660,
        start + offset,
      );
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.24, start + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.22);
    });
    window.setTimeout(() => void context.close(), 950);
  } catch {
    // Browser notification still appears when audio is unavailable or blocked.
  }
}

export async function requestOrderNotifications() {
  if ("Notification" in window && Notification.permission === "default")
    await Notification.requestPermission();
}

export function showOrderNotification(title: string, body: string, tag: string) {
  if ("Notification" in window && Notification.permission === "granted")
    new Notification(title, { body, tag });
}

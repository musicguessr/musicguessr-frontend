// iPadOS 13+ Safari reports a desktop Mac user agent, so a device-name regex
// alone misses iPads — which then took the iPhone-incompatible code paths.
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  const iosDevice = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  return iosDevice && !('MSStream' in window);
}

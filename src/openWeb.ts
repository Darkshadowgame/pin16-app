// Opens a web link from stored or synced data, only when it starts with https://.
import { Linking } from 'react-native';

export function openWeb(url: unknown): void {
  if (typeof url === 'string' && /^https:\/\//i.test(url.trim())) void Linking.openURL(url.trim()).catch(() => undefined);
}

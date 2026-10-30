import { useEffect, useState } from 'react';
import { getSiteHost, observeSiteHost } from '@/services/file/siteHost';
import { PLATFORM_BUILD } from '@/services/buildFlags';
import { isEmbedded } from '@/lib/hostRoot';

export function useOwnAssistant(): boolean {
  const [hosted, setHosted] = useState(() => !!getSiteHost());
  useEffect(() => observeSiteHost(host => setHosted(!!host)), []);
  return !PLATFORM_BUILD && !hosted && !isEmbedded() && window.origin !== 'null';
}

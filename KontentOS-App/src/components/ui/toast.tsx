import { Toaster as SonnerToaster, toast } from 'sonner';
import type { ExternalToast } from 'sonner';

/**
 * Five systems said "saved" to the creator: the bench notice with its own 5.2 s timer, BrandKit's
 * `setTimeout` with no cleanup (a state update after unmount), an identical copy-paste in Analytics,
 * PublishSchedule's in-page banner with eighteen call sites, and the canvas's zustand string. They showed
 * up in different corners, at different lengths, with different contrast — so a failure in one panel
 * taught nothing about what a failure looks like anywhere else.
 *
 * One API, one place on screen, tokens for colour. The lengths are the Studio's, already proved out:
 * a confirmation can go in four and a half seconds, a failure has to stay until it is read.
 */
export const notify = {
  ok: (message: string, data?: ExternalToast) => toast.success(message, data),
  bad: (message: string, data?: ExternalToast) => toast.error(message, { duration: 9000, ...data }),
  info: (message: string, data?: ExternalToast) => toast.message(message, data),
};

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      gap={8}
      visibleToasts={3}
      closeButton
      toastOptions={{
        duration: 4500,
        closeButtonAriaLabel: 'Dismiss',
        classNames: { toast: 'kt-toast' },
      }}
    />
  );
}

import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon } from 'sweetalert2';

import { ToastTone, toastOptions } from './toast';

/**
 * Every toast and confirm dialog in the app comes from here: top right toasts with a
 * 10 second progress bar that pause on hover, tinted by type, always plain text.
 */
@Injectable({ providedIn: 'root' })
export class AlertService {
  success(title: string, detail?: string): void {
    this.show('success', title, detail);
  }

  error(title: string, detail?: string): void {
    this.show('error', title, detail);
  }

  warning(title: string, detail?: string): void {
    this.show('warning', title, detail);
  }

  info(title: string, detail?: string): void {
    this.show('info', title, detail);
  }

  private show(tone: ToastTone, title: string, detail?: string): void {
    void Swal.fire({
      ...(detail ? toastOptions(tone, detail, title) : toastOptions(tone, title)),
      didOpen: (el) => {
        el.addEventListener('mouseenter', Swal.stopTimer);
        el.addEventListener('mouseleave', Swal.resumeTimer);
      },
    });
  }

  /**
   * Confirm dialog used before anything destructive. The confirm label states the
   * action, so the button says what will happen rather than just "Yes".
   */
  async confirm(options: ConfirmOptions): Promise<boolean> {
    const danger = options.danger !== false;
    const result = await Swal.fire({
      titleText: options.title,
      text: options.message,
      icon: options.icon ?? 'warning',
      iconColor: danger ? 'oklch(0.5 0.17 12)' : 'oklch(0.52 0.2 302)',
      showCancelButton: true,
      confirmButtonText: options.confirmLabel,
      cancelButtonText: options.cancelLabel ?? 'Keep it',
      reverseButtons: true,
      focusCancel: danger,
      customClass: danger ? { confirmButton: 'danger' } : {},
    });

    return result.isConfirmed;
  }

  /** Confirm dialog that also collects a short reason, such as a void reason. */
  async confirmWithReason(options: ReasonOptions): Promise<string | null> {
    const result = await Swal.fire({
      titleText: options.title,
      text: options.message,
      icon: 'warning',
      iconColor: 'oklch(0.5 0.17 12)',
      input: 'text',
      inputLabel: options.inputLabel,
      inputPlaceholder: options.placeholder ?? '',
      inputAttributes: { maxlength: '400', autocapitalize: 'sentences' },
      showCancelButton: true,
      confirmButtonText: options.confirmLabel,
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
      customClass: { confirmButton: 'danger' },
      inputValidator: (value) => (value.trim().length < 3 ? 'Enter at least a few words.' : null),
    });

    return result.isConfirmed ? String(result.value).trim() : null;
  }
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  icon?: SweetAlertIcon;

  /** Defaults to true, which styles the confirm button as destructive. */
  danger?: boolean;
}

export interface ReasonOptions {
  title: string;
  message: string;
  inputLabel: string;
  confirmLabel: string;
  placeholder?: string;
}

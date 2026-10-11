import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon } from 'sweetalert2';

/**
 * Every toast and confirm dialog in the app comes from here, so feedback is consistent
 * and the SweetAlert2 configuration is set once. Toasts sit top-end per the spec.
 */
@Injectable({ providedIn: 'root' })
export class AlertService {
  private readonly toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3200,
    timerProgressBar: true,
    customClass: { popup: 'tt-toast' },
    showClass: { popup: 'tt-toast-in' },
    hideClass: { popup: 'tt-toast-out' },
  });

  success(title: string, detail?: string): void {
    void this.toast.fire({
      title,
      text: detail,
      icon: 'success',
      customClass: { popup: 'tt-toast tt-toast-success' },
    });
  }

  error(title: string, detail?: string): void {
    void this.toast.fire({
      title,
      text: detail,
      icon: 'error',
      timer: 5200,
      customClass: { popup: 'tt-toast tt-toast-error' },
    });
  }

  warning(title: string, detail?: string): void {
    void this.toast.fire({
      title,
      text: detail,
      icon: 'warning',
      timer: 4200,
      customClass: { popup: 'tt-toast tt-toast-warning' },
    });
  }

  info(title: string, detail?: string): void {
    void this.toast.fire({
      title,
      text: detail,
      icon: 'info',
      customClass: { popup: 'tt-toast tt-toast-info' },
    });
  }

  /**
   * Confirm dialog used before anything destructive. The confirm label states the
   * action, so the button says what will happen rather than just "Yes".
   */
  async confirm(options: ConfirmOptions): Promise<boolean> {
    const result = await Swal.fire({
      title: options.title,
      text: options.message,
      icon: options.icon ?? 'warning',
      showCancelButton: true,
      confirmButtonText: options.confirmLabel,
      cancelButtonText: options.cancelLabel ?? 'Keep it',
      reverseButtons: true,
      focusCancel: options.danger !== false,
      customClass: {
        popup: 'tt-swal',
        confirmButton: options.danger === false ? '' : 'tt-swal-danger',
      },
    });

    return result.isConfirmed;
  }

  /** Confirm dialog that also collects a short reason, such as a void reason. */
  async confirmWithReason(options: ReasonOptions): Promise<string | null> {
    const result = await Swal.fire({
      title: options.title,
      text: options.message,
      icon: 'warning',
      input: 'text',
      inputLabel: options.inputLabel,
      inputPlaceholder: options.placeholder ?? '',
      inputAttributes: { maxlength: '400', autocapitalize: 'sentences' },
      showCancelButton: true,
      confirmButtonText: options.confirmLabel,
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      focusCancel: true,
      customClass: { popup: 'tt-swal', confirmButton: 'tt-swal-danger' },
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

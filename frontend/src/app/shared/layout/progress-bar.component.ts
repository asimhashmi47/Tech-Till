import { Component, input } from '@angular/core';

/**
 * The slim bar across the top of the window, driven by the HTTP interceptor. It is an
 * indeterminate bar rather than a percentage, because the API does not report progress.
 * Loading is the one place the spec asks for motion, so this is where it belongs.
 */
@Component({
  selector: 'tt-progress-bar',
  standalone: true,
  template: `
    <div
      class="bar"
      [class.bar--active]="active()"
      role="progressbar"
      aria-label="Loading"
      [attr.aria-busy]="active()"
    >
      <span class="bar__fill"></span>
    </div>
  `,
  styles: [
    `
      .bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: var(--tt-z-progress);
        height: 2px;
        overflow: hidden;
        background: transparent;
        opacity: 0;
        transition: opacity var(--tt-duration-fast) var(--tt-ease-out);
        pointer-events: none;
      }

      .bar--active {
        opacity: 1;
      }

      .bar__fill {
        display: block;
        width: 40%;
        height: 100%;
        border-radius: 0 var(--tt-radius-pill) var(--tt-radius-pill) 0;
        background: linear-gradient(
          90deg,
          color-mix(in oklch, var(--tt-primary) 40%, transparent),
          var(--tt-primary)
        );
        transform: translateX(-100%);
      }

      .bar--active .bar__fill {
        animation: slide 1100ms var(--tt-ease-in-out) infinite;
      }

      @keyframes slide {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(350%);
        }
      }

      /* With reduced motion the bar holds still and simply shows it is busy. */
      @media (prefers-reduced-motion: reduce) {
        .bar--active .bar__fill {
          width: 100%;
          animation: none;
          transform: none;
          opacity: 0.55;
        }
      }
    `,
  ],
})
export class ProgressBarComponent {
  readonly active = input<boolean>(false);
}

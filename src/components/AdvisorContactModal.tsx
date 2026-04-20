import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as styles from "./CompoundInterestSimulator.module.css";

type AdvisorAmountBucket = "0-20K" | "20-100K" | "100K-1M" | "1-5M" | "5M+" | "Don't know";

interface AdvisorAmountOption {
  value: AdvisorAmountBucket;
  label: string;
  heading: string;
  standardCalendlyUrl: string;
  seaCalendlyUrl: string;
}

interface AdvisorContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AnalyticsWindow = Window &
  typeof globalThis & {
    dataLayer?: Array<Record<string, unknown>>;
    gtag?: (...args: unknown[]) => void;
  };

type CalendlyInlineWidgetOptions = {
  height?: number | string;
  minWidth?: number | string;
  parentElement: HTMLElement;
  url: string;
};

type CalendlyWindow = AnalyticsWindow & {
  Calendly?: {
    initInlineWidget?: (options: CalendlyInlineWidgetOptions) => void;
  };
  __ramifyCalendlyScriptPromise?: Promise<void>;
};

type CalendlyLoadStatus = "idle" | "loading" | "ready" | "error";

const CALENDLY_WIDGET_SCRIPT_URL = "https://assets.calendly.com/assets/external/widget.js";
const CONTACT_PAGE_URL = "https://www.ramify.fr/contact";
const CALENDLY_SLOW_LOAD_DELAY_MS = 3000;
const CALENDLY_SCRIPT_STATE_ATTRIBUTE = "data-ramify-calendly-state";

function isCalendlyMessage(event: MessageEvent<unknown>): event is MessageEvent<{ event: string }> {
  if (typeof event.origin !== "string") {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(event.origin).hostname;
  } catch {
    return false;
  }

  if (hostname !== "calendly.com" && !hostname.endsWith(".calendly.com")) {
    return false;
  }

  if (!event.data || typeof event.data !== "object" || !("event" in event.data)) {
    return false;
  }

  return typeof (event.data as { event?: unknown }).event === "string";
}

function ensureCalendlyScriptLoaded(): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve();
  }

  const calendlyWindow = window as CalendlyWindow;
  if (calendlyWindow.Calendly?.initInlineWidget) {
    return Promise.resolve();
  }

  if (calendlyWindow.__ramifyCalendlyScriptPromise) {
    return calendlyWindow.__ramifyCalendlyScriptPromise;
  }

  const existingScript = document.querySelector(`script[src="${CALENDLY_WIDGET_SCRIPT_URL}"]`) as HTMLScriptElement | null;
  if (existingScript?.getAttribute(CALENDLY_SCRIPT_STATE_ATTRIBUTE) === "error") {
    existingScript.remove();
  }

  calendlyWindow.__ramifyCalendlyScriptPromise = new Promise<void>((resolve, reject) => {
    let currentScript = document.querySelector(`script[src="${CALENDLY_WIDGET_SCRIPT_URL}"]`) as HTMLScriptElement | null;

    const handleLoad = () => {
      currentScript?.setAttribute(CALENDLY_SCRIPT_STATE_ATTRIBUTE, "loaded");
      resolve();
    };
    const handleError = () => {
      currentScript?.setAttribute(CALENDLY_SCRIPT_STATE_ATTRIBUTE, "error");
      currentScript?.remove();
      calendlyWindow.__ramifyCalendlyScriptPromise = undefined;
      reject(new Error("Unable to load Calendly script"));
    };

    if (currentScript) {
      currentScript.addEventListener("load", handleLoad, { once: true });
      currentScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = CALENDLY_WIDGET_SCRIPT_URL;
    script.async = true;
    script.setAttribute(CALENDLY_SCRIPT_STATE_ATTRIBUTE, "loading");
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.body.appendChild(script);
    currentScript = script;
  });

  return calendlyWindow.__ramifyCalendlyScriptPromise;
}

const ADVISOR_AMOUNT_OPTIONS: AdvisorAmountOption[] = [
  {
    value: "0-20K",
    label: "Moins de 20 000 €",
    heading: "Échangez avec un conseiller Ramify",
    standardCalendlyUrl:
      "https://calendly.com/d/dvk-jm7-7d9/echange-avec-un-conseiller-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
    seaCalendlyUrl:
      "https://calendly.com/d/dsz-m76-46v/echange-avec-nos-conseillers-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
  },
  {
    value: "20-100K",
    label: "Entre 20 000 € et 100 000 €",
    heading: "Échangez avec un conseiller privé Ramify",
    standardCalendlyUrl:
      "https://calendly.com/d/dt5-wj5-rk3/echange-avec-un-conseiller-prive-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
    seaCalendlyUrl:
      "https://calendly.com/d/dm5-8c5-2rs/echange-avec-nos-conseillers-prives-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
  },
  {
    value: "100K-1M",
    label: "Entre 100 000 € et 1 000 000 €",
    heading: "Échangez avec un conseiller dédié Ramify",
    standardCalendlyUrl:
      "https://calendly.com/d/hxd-ppp-c78/echange-avec-un-conseiller-dedie-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
    seaCalendlyUrl:
      "https://calendly.com/d/hkc-nc9-9j3/echange-avec-nos-conseillers-dedies-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
  },
  {
    value: "1-5M",
    label: "Entre 1 000 000 € et 5 000 000 €",
    heading: "Échangez avec un conseiller Gestion de fortune Ramify",
    standardCalendlyUrl:
      "https://calendly.com/d/cksv-vnh-7v6/echange-avec-un-conseiller-gestion-de-fortune-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
    seaCalendlyUrl:
      "https://calendly.com/d/cmkd-6hn-2zk/echange-avec-nos-conseillers-gestion-de-fortune-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
  },
  {
    value: "5M+",
    label: "Plus de 5 000 000 €",
    heading: "Échangez avec un conseiller Gestion de fortune Ramify",
    standardCalendlyUrl:
      "https://calendly.com/d/cksv-vnh-7v6/echange-avec-un-conseiller-gestion-de-fortune-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
    seaCalendlyUrl:
      "https://calendly.com/d/cmkd-6hn-2zk/echange-avec-nos-conseillers-gestion-de-fortune-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
  },
  {
    value: "Don't know",
    label: "Je ne sais pas",
    heading: "Échangez avec un conseiller Ramify",
    standardCalendlyUrl:
      "https://calendly.com/d/dvk-jm7-7d9/echange-avec-un-conseiller-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
    seaCalendlyUrl:
      "https://calendly.com/d/dsz-m76-46v/echange-avec-nos-conseillers-ramify?hide_event_type_details=1&hide_gdpr_banner=1&utm_source=website",
  },
];

function pushDataLayerEvent(event: string, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
  analyticsWindow.dataLayer.push({ event, ...properties });
}

export function trackAdvisorModalOpen() {
  pushDataLayerEvent("book_meeting_cta");
}

function trackAdvisorAmountSelection(amountBucket: AdvisorAmountBucket) {
  if (typeof window === "undefined") return;

  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow.gtag?.("event", "book_meeting_intermediate_new");
  pushDataLayerEvent("book_meeting_intermediate_step", { amount_bucket: amountBucket });
}

export function AdvisorContactModal({ isOpen, onClose }: AdvisorContactModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<AdvisorAmountBucket | null>(null);
  const [isSeaVisitor, setIsSeaVisitor] = useState(false);
  const [calendlyLoadStatus, setCalendlyLoadStatus] = useState<CalendlyLoadStatus>("idle");
  const [showCalendlyFallback, setShowCalendlyFallback] = useState(false);
  const calendlyContainerRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  const selectedOption = useMemo(
    () => ADVISOR_AMOUNT_OPTIONS.find((option) => option.value === selectedAmount) ?? null,
    [selectedAmount],
  );

  const selectedCalendlyUrl = useMemo(() => {
    if (!selectedOption) return null;
    return isSeaVisitor ? selectedOption.seaCalendlyUrl : selectedOption.standardCalendlyUrl;
  }, [isSeaVisitor, selectedOption]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedAmount(null);
      setIsSeaVisitor(false);
      setCalendlyLoadStatus("idle");
      setShowCalendlyFallback(false);
      return;
    }

    try {
      setIsSeaVisitor(Boolean(window.sessionStorage.getItem("fromSEA")));
    } catch {
      setIsSeaVisitor(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    void ensureCalendlyScriptLoaded().catch(() => {
      /* Handled on selection when the widget is actually needed. */
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !selectedCalendlyUrl || !calendlyContainerRef.current) return;

    const container = calendlyContainerRef.current;
    let cancelled = false;
    let trackedIframe: HTMLIFrameElement | null = null;

    const setCalendlyReady = () => {
      if (cancelled) return;
      setCalendlyLoadStatus("ready");
      setShowCalendlyFallback(false);
    };

    const removeCalendlySpinner = () => {
      const spinner = container.querySelector(".calendly-spinner");
      if (!(spinner instanceof HTMLElement)) {
        return;
      }

      spinner.remove();
    };

    const bindIframeLoad = () => {
      removeCalendlySpinner();

      const iframe = container.querySelector("iframe");
      if (!(iframe instanceof HTMLIFrameElement) || iframe === trackedIframe) {
        return;
      }

      trackedIframe = iframe;
      iframe.addEventListener("load", setCalendlyReady, { once: true });
    };

    const handleCalendlyMessage = (event: MessageEvent<unknown>) => {
      if (!isCalendlyMessage(event)) return;
      if (!trackedIframe?.contentWindow || event.source !== trackedIframe.contentWindow) {
        return;
      }

      if (event.data.event === "calendly.page_height_resize") {
        return;
      }

      setCalendlyReady();
    };

    const observer = new MutationObserver(() => {
      removeCalendlySpinner();
      bindIframeLoad();
    });

    observer.observe(container, { childList: true, subtree: true });
    window.addEventListener("message", handleCalendlyMessage);
    container.innerHTML = "";
    setCalendlyLoadStatus("loading");
    setShowCalendlyFallback(false);

    const slowLoadTimer = window.setTimeout(() => {
      if (!cancelled) {
        setShowCalendlyFallback(true);
      }
    }, CALENDLY_SLOW_LOAD_DELAY_MS);

    void ensureCalendlyScriptLoaded()
      .then(() => {
        if (cancelled) return;

        const calendlyWindow = window as CalendlyWindow;
        if (!calendlyWindow.Calendly?.initInlineWidget) {
          throw new Error("Calendly widget unavailable");
        }

        container.innerHTML = "";
        calendlyWindow.Calendly.initInlineWidget({
          height: "700px",
          minWidth: "320px",
          parentElement: container,
          url: selectedCalendlyUrl,
        });
        bindIframeLoad();
      })
      .catch(() => {
        if (cancelled) return;
        setCalendlyLoadStatus("error");
        setShowCalendlyFallback(true);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(slowLoadTimer);
      observer.disconnect();
      window.removeEventListener("message", handleCalendlyMessage);
      container.innerHTML = "";
    };
  }, [isOpen, selectedCalendlyUrl]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  const handleAmountClick = (amountBucket: AdvisorAmountBucket) => {
    trackAdvisorAmountSelection(amountBucket);
    setCalendlyLoadStatus("loading");
    setShowCalendlyFallback(false);
    setSelectedAmount(amountBucket);
  };

  const isCalendlyLoading = calendlyLoadStatus === "loading";
  const hasCalendlyError = calendlyLoadStatus === "error";

  return (
    <div className={styles.contactModalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.contactModalDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.contactModalHeader}>
          <div className={styles.contactModalHeaderContent}>
            <div className={styles.contactModalProgress} aria-hidden="true">
              <span className={`${styles.contactModalProgressStep} ${styles.contactModalProgressStepActive}`} />
              <span
                className={`${styles.contactModalProgressStep} ${selectedOption ? styles.contactModalProgressStepActive : ""}`}
              />
            </div>
            <h2 id={titleId} className={styles.contactModalTitle}>
              {selectedOption ? selectedOption.heading : "Quel montant souhaitez-vous investir ?"}
            </h2>
            <p className={styles.contactModalLead}>
              {selectedOption
                ? "Choisissez directement un créneau avec l'équipe Ramify."
                : "Cette information nous permettra de mieux vous conseiller. Une estimation suffit."}
            </p>
          </div>
          <button type="button" className={styles.contactModalCloseButton} onClick={onClose} aria-label="Fermer la fenêtre">
            ×
          </button>
        </div>

        <div className={styles.contactModalBody}>
          {selectedOption ? (
            <>
              <div className={styles.contactCalendlyStage}>
                {(isCalendlyLoading || hasCalendlyError) && (
                  <div
                    className={`${styles.contactCalendlyLoader} ${hasCalendlyError ? styles.contactCalendlyLoaderError : ""}`}
                    aria-busy={isCalendlyLoading}
                    aria-live="polite"
                  >
                    {!hasCalendlyError && <span className={styles.contactCalendlyLoaderSpinner} aria-hidden="true" />}
                    <p className={styles.contactCalendlyLoaderTitle}>
                      {hasCalendlyError ? "Impossible d'afficher le calendrier" : "Chargement du calendrier"}
                    </p>
                    <p className={styles.contactCalendlyLoaderText}>
                      {hasCalendlyError
                        ? "Vous pouvez ouvrir directement le calendrier ou passer par la page contact complète."
                        : "Cela peut prendre quelques secondes, surtout sur mobile."}
                    </p>
                    {showCalendlyFallback && (
                      <div className={styles.contactCalendlyLoaderActions}>
                        <a
                          className={styles.contactCalendlyLoaderPrimaryLink}
                          href={selectedCalendlyUrl ?? CONTACT_PAGE_URL}
                          target="_self"
                        >
                          Ouvrir directement le calendrier
                        </a>
                        {!hasCalendlyError && (
                          <p className={styles.contactCalendlyLoaderHint}>
                            Si rien n'apparaît, ce lien permet de continuer sans attendre.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div ref={calendlyContainerRef} className={styles.contactCalendlyContainer} />
              </div>
              <div className={styles.contactModalFooter}>
                <button type="button" className={styles.contactModalSecondaryAction} onClick={() => setSelectedAmount(null)}>
                  Changer le montant
                </button>
                <a className={styles.contactModalFallbackLink} href={CONTACT_PAGE_URL} target="_self">
                  Ouvrir la page contact complète
                </a>
              </div>
            </>
          ) : (
            <div className={styles.contactAmountList}>
              {ADVISOR_AMOUNT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={styles.contactAmountButton}
                  onClick={() => handleAmountClick(option.value)}
                >
                  <span className={styles.contactAmountButtonLabel}>{option.label}</span>
                  <span className={styles.contactAmountButtonArrow} aria-hidden="true">
                    →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

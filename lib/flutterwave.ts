// Flutterwave Payment Integration
// Replace these with your actual Flutterwave credentials

export const FLUTTERWAVE_CONFIG = {
  PUBLIC_KEY: process.env.EXPO_PUBLIC_FLUTTERWAVE_PUBLIC_KEY || 'FLWPUBK_TEST-9dea0cb7964dee3e0c46c18206b2cfcd-X',
  SECRET_KEY: process.env.EXPO_PUBLIC_FLUTTERWAVE_SECRET || 'FLWSECK_TEST-XXXXXXXXXXXXX',
  ENVIRONMENT: process.env.EXPO_PUBLIC_FLUTTERWAVE_ENV || 'staging',
};

type FlutterwaveWebPaymentConfig = {
  public_key: string;
  tx_ref: string;
  amount: number;
  currency: string;
  customer: { email: string; name: string };
  subaccounts?: Array<{ id: string; transaction_split_ratio?: number }>;
  onSuccess: (response: unknown) => void;
  onClose: () => void;
};

type FlutterwaveCheckout = (options: {
  public_key: string;
  tx_ref: string;
  amount: number;
  currency: string;
  payment_options: string;
  customer: { email: string; name: string };
  subaccounts?: Array<{ id: string; transaction_split_ratio?: number }>;
  callback: (response: unknown) => void;
  onclose: () => void;
}) => void;

const FLUTTERWAVE_SCRIPT_URL = 'https://checkout.flutterwave.com/v3.js';
const FLUTTERWAVE_SCRIPT_ID = 'flutterwave-js';
let flutterwaveScriptPromise: Promise<void> | null = null;

const getFlutterwaveCheckout = () =>
  (window as Window & { FlutterwaveCheckout?: FlutterwaveCheckout }).FlutterwaveCheckout;

const loadFlutterwaveScript = (): Promise<void> => {
  if (getFlutterwaveCheckout()) {
    return Promise.resolve();
  }

  if (flutterwaveScriptPromise) {
    return flutterwaveScriptPromise;
  }

  flutterwaveScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.head.querySelector<HTMLScriptElement>(
      `script[src="${FLUTTERWAVE_SCRIPT_URL}"]`
    );
    const script = existingScript || document.createElement('script');

    script.id = script.id || FLUTTERWAVE_SCRIPT_ID;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error('Failed to load the Flutterwave checkout script.')),
      { once: true }
    );

    if (!existingScript) {
      script.src = FLUTTERWAVE_SCRIPT_URL;
      document.head.appendChild(script);
    } else {
      setTimeout(() => {
        if (getFlutterwaveCheckout()) {
          resolve();
        }
      }, 0);
    }
  }).catch((error: unknown) => {
    flutterwaveScriptPromise = null;
    throw error;
  });

  return flutterwaveScriptPromise;
};

const triggerFlutterwaveWebModal = (config: FlutterwaveWebPaymentConfig) => {
  const checkout = getFlutterwaveCheckout();
  if (!checkout) {
    console.error('Flutterwave checkout is unavailable after the script loaded.');
    config.onClose();
    return;
  }

  checkout({
    public_key: config.public_key,
    tx_ref: config.tx_ref,
    amount: config.amount,
    currency: config.currency || 'NGN',
    payment_options: 'card, banktransfer, ussd',
    customer: config.customer,
    ...(config.subaccounts ? { subaccounts: config.subaccounts } : {}),
    callback: config.onSuccess,
    onclose: config.onClose,
  });
};

export const handleFlutterwaveWebPayment = (config: FlutterwaveWebPaymentConfig) => {
  if (typeof document === 'undefined') {
    config.onClose();
    return;
  }

  if (!getFlutterwaveCheckout()) {
    window.alert('Initializing payment gateway, please confirm to proceed...');
  }

  loadFlutterwaveScript()
    .then(() => triggerFlutterwaveWebModal(config))
    .catch((error: unknown) => {
      console.error('Failed to load Flutterwave checkout.', error);
      config.onClose();
    });
};

export type FlutterwavePaymentPayload = {
  tx_ref: string;
  amount: number;
  currency: 'NGN';
  payment_options: string;
  customer: {
    email: string;
    name?: string;
    phone_number?: string;
  };
  customizations: {
    title: string;
    description: string;
    logo?: string;
  };
  redirect_url?: string;
};

export type FlutterwaveResponse = {
  status: 'success' | 'error';
  message: string;
  data?: {
    id: string;
    tx_ref: string;
    flw_ref: string;
    status: string;
    amount: number;
    currency: string;
    customer: {
      email: string;
    };
  };
};

/**
 * Initialize Flutterwave payment for a product purchase
 */
export const initializePayment = async (
  amount: number,
  productName: string,
  userEmail: string,
  userName?: string,
  conversationId?: string
): Promise<FlutterwavePaymentPayload> => {
  const payload: FlutterwavePaymentPayload = {
    tx_ref: `ORDER-${conversationId || Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    amount,
    currency: 'NGN',
    payment_options: 'card,ussd,account_transfer',
    customer: {
      email: userEmail,
      name: userName,
      phone_number: undefined,
    },
    customizations: {
      title: 'MVS Pet Store',
      description: `Payment for ${productName}`,
    },
  };

  return payload;
};

/**
 * Verify payment status with Flutterwave
 */
export const verifyPayment = async (transactionId: string): Promise<boolean> => {
  try {
    const response = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${FLUTTERWAVE_CONFIG.SECRET_KEY}`,
        },
      }
    );

    const data: FlutterwaveResponse = await response.json();
    return data.status === 'success' && data.data?.status === 'successful';
  } catch (error) {
    console.error('Payment verification failed:', error);
    return false;
  }
};

/**
 * Format payment reference for display
 */
export const formatPaymentRef = (ref: string): string => {
  return ref.substring(0, 20) + '...';
};

/**
 * Check if payment amount is valid
 */
export const isValidPaymentAmount = (amount: number): boolean => {
  return amount > 0 && amount <= 999999999;
};

// Flutterwave Payment Integration
// Replace these with your actual Flutterwave credentials

export const FLUTTERWAVE_CONFIG = {
  PUBLIC_KEY: process.env.EXPO_PUBLIC_FLUTTERWAVE_KEY || 'FLWPUBK_TEST-XXXXXXXXXXXXX',
  SECRET_KEY: process.env.EXPO_PUBLIC_FLUTTERWAVE_SECRET || 'FLWSECK_TEST-XXXXXXXXXXXXX',
  ENVIRONMENT: process.env.EXPO_PUBLIC_FLUTTERWAVE_ENV || 'staging',
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

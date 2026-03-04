/**
 * @h-ai/payment — Stripe 类型
 *
 * Stripe API 的内部请求/响应类型。
 * @module stripe-types
 */

/** Stripe Checkout Session 创建参数 */
export interface StripeCheckoutParams {
  mode: 'payment'
  line_items: Array<{
    price_data: {
      currency: string
      product_data: { name: string }
      unit_amount: number
    }
    quantity: number
  }>
  success_url?: string
  cancel_url?: string
  metadata?: Record<string, string>
}

/** Stripe Webhook Event */
export interface StripeWebhookEvent {
  id: string
  type: string
  data: {
    object: {
      id: string
      metadata?: Record<string, string>
      amount_total?: number
      currency?: string
      payment_status?: string
      [key: string]: unknown
    }
  }
}

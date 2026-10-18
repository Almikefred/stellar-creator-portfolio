import type Stripe from 'stripe'
import {
  findEscrowByPaymentIntent,
  getEscrow,
  markFailed,
  markFundedAuthorized,
  markRefunded,
  markReleased,
  type EscrowRecord,
} from './escrow-service'

/**
 * Finds the escrow a PaymentIntent funds: by the escrowId stamped into its
 * metadata when it was created, falling back to the stored PaymentIntent id.
 */
function escrowForPaymentIntent(pi: Stripe.PaymentIntent): EscrowRecord | undefined {
  const fromMetadata = pi.metadata?.escrowId ? getEscrow(pi.metadata.escrowId) : undefined
  return fromMetadata ?? findEscrowByPaymentIntent(pi.id)
}

function receiptUrlOf(pi: Stripe.PaymentIntent): string | undefined {
  const charge = pi.latest_charge
  return typeof charge === 'object' && charge ? charge.receipt_url ?? undefined : undefined
}

/**
 * Applies a verified Stripe event to the escrow state machine.
 *
 * Escrow PaymentIntents use manual capture, so the lifecycle is:
 *   amount_capturable_updated → funds authorised (held)
 *   succeeded                 → captured, i.e. released to the freelancer
 *   canceled                  → authorisation voided, i.e. refunded
 *   payment_failed            → funding failed
 *
 * Events for PaymentIntents that don't belong to an escrow are ignored.
 * Returns the updated escrow, or null when nothing changed.
 */
export async function processStripeWebhookEvent(event: Stripe.Event): Promise<EscrowRecord | null> {
  switch (event.type) {
    case 'payment_intent.amount_capturable_updated': {
      const pi = event.data.object
      const escrow = escrowForPaymentIntent(pi)
      return escrow ? markFundedAuthorized(escrow.id, receiptUrlOf(pi)) : null
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object
      const escrow = escrowForPaymentIntent(pi)
      return escrow ? markReleased(escrow.id, receiptUrlOf(pi)) : null
    }
    case 'payment_intent.canceled': {
      const escrow = escrowForPaymentIntent(event.data.object)
      return escrow ? markRefunded(escrow.id) : null
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object
      const escrow = escrowForPaymentIntent(pi)
      return escrow ? markFailed(escrow.id, pi.last_payment_error?.message) : null
    }
    default:
      return null
  }
}

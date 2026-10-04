/** @typedef {{ amountInPaise: number, currency: 'INR', receipt: string }} CreateOrderInput */
/** @typedef {{ id: string, amountInPaise: number, currency: 'INR', receipt: string, simulated: boolean }} Order */
/** @typedef {{ id: string, orderId: string, amountInPaise: number, currency: 'INR', status: 'captured', simulated: boolean }} Payment */
/** @typedef {{ id: string, paymentId: string, status: 'pending' | 'processed', simulated: boolean }} Refund */
/** @typedef {{ name: string, mode: import('../config.js').CallMode }} CreateRoomInput */
/** @typedef {{ id: string, mode: import('../config.js').CallMode, simulated: boolean }} Room */
/** @typedef {{ roomId: string, userId: string, role: 'host' | 'guest', mode: import('../config.js').CallMode, expiresAt: number }} JoinTokenInput */
/** @typedef {{ to: string, template: string, variables: Record<string, string> }} MessageInput */
/** @typedef {{ id: string, simulated: boolean }} MessageResult */
/**
 * @typedef {Object} Providers
 * @property {'demo' | 'live'} mode
 * @property {{ createOrder: (input: CreateOrderInput) => Promise<Order>, fetchPayment: (id: string) => Promise<Payment>, refundPayment: (input: { paymentId: string, amountInPaise: number, idempotencyKey: string }) => Promise<Refund> }} payments
 * @property {{ createRoom: (input: CreateRoomInput) => Promise<Room>, createJoinToken: (input: JoinTokenInput) => Promise<{ token: string, simulated: boolean }> }} calls
 * @property {{ sendEmail: (input: MessageInput) => Promise<MessageResult>, sendWhatsApp: (input: MessageInput) => Promise<MessageResult> }} notifications
 */

export {};

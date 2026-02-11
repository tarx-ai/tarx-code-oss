/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *
 *  Stripe Billing Service — Customer, subscription, metered billing, checkout.
 *  SECURITY: API keys stored via VS Code SecretStorage (OS keychain).
 *  Only TEST keys (sk_test_) are allowed during development.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import Stripe from 'stripe';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STRIPE_SECRET_KEY_STORAGE = 'tarx.stripe.secretKey';
const STRIPE_CUSTOMER_ID_STORAGE = 'tarx.stripe.customerId';
const STRIPE_SUBSCRIPTION_ID_STORAGE = 'tarx.stripe.subscriptionId';

/** Stripe price IDs — must match your Stripe dashboard (test mode) */
export const TIER_PRICE_IDS = {
	lite: 'price_TARX_LITE_7_MONTHLY',       // $7/mo
	pro: 'price_TARX_PRO_49_MONTHLY',        // $49/mo
	max: 'price_TARX_MAX_99_MONTHLY',        // $99/mo
} as const;

/** Metered billing price ID for mesh compute */
export const MESH_METERED_PRICE_ID = 'price_TARX_MESH_COMPUTE_METERED';

export const TIER_DETAILS = {
	free: { label: 'Free', price: 0, meshCreditsIncluded: 100 },
	lite: { label: 'Lite', price: 7, meshCreditsIncluded: 1000 },
	pro: { label: 'Pro', price: 49, meshCreditsIncluded: 10000 },
	max: { label: 'Max', price: 99, meshCreditsIncluded: 50000 },
} as const;

export const OVERAGE_RATE = 0.002; // $0.002 per credit

export type BillingTier = 'free' | 'lite' | 'pro' | 'max';

export interface BillingStatus {
	tier: BillingTier;
	tierLabel: string;
	priceMonthly: number;
	subscriptionStatus: 'active' | 'past_due' | 'canceled' | 'trialing' | 'none';
	currentPeriodEnd: number | null;
	meshCreditsUsed: number;
	meshCreditsIncluded: number;
	meshCreditsOverage: number;
	overageRate: number;
	customerId: string | null;
	canUpgrade: boolean;
	canManage: boolean;
}

// ═══════════════════════════════════════════════════════════════
// MODULE STATE (same pattern as networkModel.ts)
// ═══════════════════════════════════════════════════════════════

let _secrets: vscode.SecretStorage | undefined;
let _stripe: Stripe | undefined;

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

export function initStripeService(context: vscode.ExtensionContext): void {
	_secrets = context.secrets;
	console.log('[TARX Stripe] Service initialized with SecretStorage');
}

async function getStripeClient(): Promise<Stripe | undefined> {
	if (_stripe) { return _stripe; }
	const key = await getStripeSecretKey();
	if (!key) { return undefined; }
	_stripe = new Stripe(key);
	return _stripe;
}

// ═══════════════════════════════════════════════════════════════
// SECRET KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export async function getStripeSecretKey(): Promise<string | undefined> {
	if (_secrets) {
		const stored = await _secrets.get(STRIPE_SECRET_KEY_STORAGE);
		if (stored) { return stored; }
	}
	return process.env.STRIPE_SECRET_KEY;
}

export async function storeStripeSecretKey(key: string): Promise<void> {
	if (!_secrets) { throw new Error('Stripe service not initialized'); }
	if (!key.startsWith('sk_test_')) {
		throw new Error('Only Stripe TEST keys (sk_test_) are allowed');
	}
	await _secrets.store(STRIPE_SECRET_KEY_STORAGE, key);
	_stripe = undefined; // Reset client to pick up new key
	console.log('[TARX Stripe] Secret key stored securely');
}

export async function deleteStripeSecretKey(): Promise<void> {
	if (!_secrets) { throw new Error('Stripe service not initialized'); }
	await _secrets.delete(STRIPE_SECRET_KEY_STORAGE);
	_stripe = undefined;
	console.log('[TARX Stripe] Secret key deleted');
}

export async function hasStripeKey(): Promise<boolean> {
	const key = await getStripeSecretKey();
	return Boolean(key && key.length > 0);
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

async function getStoredCustomerId(): Promise<string | undefined> {
	if (_secrets) { return _secrets.get(STRIPE_CUSTOMER_ID_STORAGE); }
	return undefined;
}

async function storeCustomerId(id: string): Promise<void> {
	if (_secrets) { await _secrets.store(STRIPE_CUSTOMER_ID_STORAGE, id); }
}

export async function ensureCustomer(email?: string): Promise<string | undefined> {
	const existing = await getStoredCustomerId();
	if (existing) { return existing; }

	const stripe = await getStripeClient();
	if (!stripe) { return undefined; }

	const customer = await stripe.customers.create({
		email: email || undefined,
		metadata: { source: 'tarx-vscode-extension' },
	});

	await storeCustomerId(customer.id);
	console.log('[TARX Stripe] Customer created:', customer.id);
	return customer.id;
}

// ═══════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════

async function getStoredSubscriptionId(): Promise<string | undefined> {
	if (_secrets) { return _secrets.get(STRIPE_SUBSCRIPTION_ID_STORAGE); }
	return undefined;
}

export async function getCurrentSubscription(): Promise<Stripe.Subscription | null> {
	const stripe = await getStripeClient();
	if (!stripe) { return null; }

	const subId = await getStoredSubscriptionId();
	if (!subId) { return null; }

	try {
		return await stripe.subscriptions.retrieve(subId, {
			expand: ['items.data.price'],
		});
	} catch {
		return null;
	}
}

function tierFromPriceId(priceId: string): BillingTier {
	for (const [tier, id] of Object.entries(TIER_PRICE_IDS)) {
		if (id === priceId) { return tier as BillingTier; }
	}
	return 'free';
}

// ═══════════════════════════════════════════════════════════════
// CHECKOUT SESSIONS
// ═══════════════════════════════════════════════════════════════

export async function createCheckoutSession(tier: BillingTier): Promise<string | undefined> {
	if (tier === 'free') { return undefined; }

	const stripe = await getStripeClient();
	if (!stripe) { throw new Error('Stripe not configured'); }

	const customerId = await ensureCustomer();
	if (!customerId) { throw new Error('Could not create customer'); }

	const priceId = TIER_PRICE_IDS[tier as keyof typeof TIER_PRICE_IDS];
	if (!priceId) { throw new Error(`Unknown tier: ${tier}`); }

	const session = await stripe.checkout.sessions.create({
		customer: customerId,
		mode: 'subscription',
		line_items: [
			{ price: priceId, quantity: 1 },
			{ price: MESH_METERED_PRICE_ID },
		],
		success_url: 'https://tarx.ai/billing/success?session_id={CHECKOUT_SESSION_ID}',
		cancel_url: 'https://tarx.ai/billing/cancel',
		metadata: { source: 'tarx-vscode-extension', tier },
	});

	return session.url ?? undefined;
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER PORTAL
// ═══════════════════════════════════════════════════════════════

export async function createPortalSession(): Promise<string | undefined> {
	const stripe = await getStripeClient();
	if (!stripe) { throw new Error('Stripe not configured'); }

	const customerId = await getStoredCustomerId();
	if (!customerId) { throw new Error('No customer found'); }

	const session = await stripe.billingPortal.sessions.create({
		customer: customerId,
		return_url: 'https://tarx.ai/billing/return',
	});

	return session.url;
}

// ═══════════════════════════════════════════════════════════════
// METERED BILLING (mesh compute credits)
// ═══════════════════════════════════════════════════════════════

export async function reportMeshUsage(credits: number): Promise<boolean> {
	if (credits <= 0) { return true; }

	const stripe = await getStripeClient();
	if (!stripe) { return false; }

	const subscription = await getCurrentSubscription();
	if (!subscription) { return false; }

	const meteredItem = subscription.items.data.find(
		item => item.price.id === MESH_METERED_PRICE_ID
	);
	if (!meteredItem) {
		console.warn('[TARX Stripe] No metered item found in subscription');
		return false;
	}

	try {
		await stripe.subscriptionItems.createUsageRecord(meteredItem.id, {
			quantity: Math.round(credits),
			timestamp: Math.floor(Date.now() / 1000),
			action: 'increment',
		});
		console.log(`[TARX Stripe] Reported ${credits} mesh credits`);
		return true;
	} catch (error) {
		console.error('[TARX Stripe] Failed to report usage:', error);
		return false;
	}
}

// ═══════════════════════════════════════════════════════════════
// BILLING STATUS (aggregated for UI)
// ═══════════════════════════════════════════════════════════════

export async function getBillingStatus(): Promise<BillingStatus> {
	const customerId = (await getStoredCustomerId()) ?? null;
	const subscription = await getCurrentSubscription();

	if (!subscription || subscription.status === 'canceled') {
		const details = TIER_DETAILS.free;
		return {
			tier: 'free',
			tierLabel: details.label,
			priceMonthly: details.price,
			subscriptionStatus: subscription?.status === 'canceled' ? 'canceled' : 'none',
			currentPeriodEnd: null,
			meshCreditsUsed: 0,
			meshCreditsIncluded: details.meshCreditsIncluded,
			meshCreditsOverage: 0,
			overageRate: OVERAGE_RATE,
			customerId,
			canUpgrade: true,
			canManage: false,
		};
	}

	// Determine tier from subscription price
	const mainItem = subscription.items.data.find(item =>
		Object.values(TIER_PRICE_IDS).includes(item.price.id as typeof TIER_PRICE_IDS[keyof typeof TIER_PRICE_IDS])
	);
	const tier = mainItem ? tierFromPriceId(mainItem.price.id) : 'free';
	const details = TIER_DETAILS[tier];

	// Get metered usage for current period
	let meshCreditsUsed = 0;
	const meteredItem = subscription.items.data.find(
		item => item.price.id === MESH_METERED_PRICE_ID
	);
	if (meteredItem) {
		try {
			const stripe = await getStripeClient();
			if (stripe) {
				const summaries = await stripe.subscriptionItems.listUsageRecordSummaries(
					meteredItem.id, { limit: 1 }
				);
				if (summaries.data.length > 0) {
					meshCreditsUsed = summaries.data[0].total_usage;
				}
			}
		} catch {
			// Usage summary may not be available yet
		}
	}

	const meshCreditsOverage = Math.max(0, meshCreditsUsed - details.meshCreditsIncluded);

	return {
		tier,
		tierLabel: details.label,
		priceMonthly: details.price,
		subscriptionStatus: subscription.status as BillingStatus['subscriptionStatus'],
		currentPeriodEnd: subscription.current_period_end,
		meshCreditsUsed,
		meshCreditsIncluded: details.meshCreditsIncluded,
		meshCreditsOverage,
		overageRate: OVERAGE_RATE,
		customerId,
		canUpgrade: tier !== 'max',
		canManage: true,
	};
}
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) TARX AI. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useEffect, useState, useCallback } from 'react';
import { postMessage } from '../hooks/useVSCodeAPI';
import type { BillingStatus, BillingTier } from '../types';

interface BillingSectionProps {
	billing: BillingStatus | null;
}

export const BillingSection: React.FC<BillingSectionProps> = ({ billing }) => {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		postMessage({ command: 'getBillingStatus' });
	}, []);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const msg = event.data;
			if (msg.command === 'billingCheckoutUrl' || msg.command === 'billingPortalUrl') {
				setIsLoading(false);
			} else if (msg.command === 'billingError') {
				setIsLoading(false);
				setError(msg.error);
			}
		};
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, []);

	const handleUpgrade = useCallback((tier: BillingTier) => {
		setIsLoading(true);
		setError(null);
		postMessage({ command: 'startCheckout', tier });
	}, []);

	const handleManage = useCallback(() => {
		setIsLoading(true);
		setError(null);
		postMessage({ command: 'openBillingPortal' });
	}, []);

	const creditsPercent = billing
		? Math.min(100, (billing.meshCreditsUsed / Math.max(1, billing.meshCreditsIncluded)) * 100)
		: 0;

	const formatDate = (ts: number | null) => {
		if (!ts) { return 'N/A'; }
		return new Date(ts * 1000).toLocaleDateString();
	};

	return (
		<div className="tarx-settings-section">
			<div className="tarx-settings-section-title">
				<span className="codicon codicon-credit-card" style={{ marginRight: 6 }} />
				Billing
			</div>

			{/* Current Tier */}
			<div className="tarx-settings-group">
				<div className="tarx-settings-group-header">
					<span className="tarx-settings-group-label">Current Plan</span>
					<span className={`tarx-billing-badge ${billing?.tier || 'free'}`}>
						{billing?.tierLabel || 'Free'}
					</span>
				</div>

				{billing?.subscriptionStatus === 'active' && (
					<div className="tarx-billing-details">
						<div className="tarx-billing-row">
							<span className="tarx-billing-label">Status</span>
							<span className="tarx-billing-value active">Active</span>
						</div>
						<div className="tarx-billing-row">
							<span className="tarx-billing-label">Renews</span>
							<span className="tarx-billing-value">{formatDate(billing.currentPeriodEnd)}</span>
						</div>
						<div className="tarx-billing-row">
							<span className="tarx-billing-label">Monthly</span>
							<span className="tarx-billing-value">${billing.priceMonthly}/mo</span>
						</div>
					</div>
				)}
			</div>

			{/* Mesh Credits */}
			<div className="tarx-settings-group">
				<div className="tarx-settings-group-header">
					<span className="tarx-settings-group-label">Mesh Compute Credits</span>
				</div>
				<div className="tarx-billing-credits">
					<div className="tarx-billing-bar">
						<div
							className={`tarx-billing-bar-fill${creditsPercent > 90 ? ' warning' : ''}`}
							style={{ width: `${creditsPercent}%` }}
						/>
					</div>
					<div className="tarx-billing-credits-text">
						{billing?.meshCreditsUsed ?? 0} / {billing?.meshCreditsIncluded ?? 100} credits
					</div>
					{(billing?.meshCreditsOverage ?? 0) > 0 && (
						<div className="tarx-billing-overage">
							{billing!.meshCreditsOverage} overage credits
							(${(billing!.meshCreditsOverage * billing!.overageRate).toFixed(2)})
						</div>
					)}
				</div>
			</div>

			{/* Actions */}
			<div className="tarx-billing-actions">
				{billing?.canUpgrade && billing.tier === 'free' && (
					<button
						className="tarx-settings-btn primary"
						onClick={() => handleUpgrade('lite')}
						disabled={isLoading}
					>
						Upgrade to Lite ($7/mo)
					</button>
				)}
				{billing?.canUpgrade && billing.tier === 'lite' && (
					<button
						className="tarx-settings-btn primary"
						onClick={() => handleUpgrade('pro')}
						disabled={isLoading}
					>
						Upgrade to Pro ($49/mo)
					</button>
				)}
				{billing?.canUpgrade && (billing.tier === 'lite' || billing.tier === 'pro') && (
					<button
						className="tarx-settings-btn"
						onClick={() => handleUpgrade('max')}
						disabled={isLoading}
					>
						{billing.tier === 'lite' ? 'Max ($99/mo)' : 'Upgrade to Max ($99/mo)'}
					</button>
				)}
				{billing?.canManage && (
					<button
						className="tarx-settings-btn"
						onClick={handleManage}
						disabled={isLoading}
					>
						Manage Subscription
					</button>
				)}
			</div>

			{error && (
				<div className="tarx-billing-error">{error}</div>
			)}
		</div>
	);
};
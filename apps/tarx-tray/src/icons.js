// @ts-check
'use strict';

const { nativeImage } = require('electron');

const SIZE = 32; // 32px at 2x scale = 16pt retina
const SCALE = 2.0;

// Brand colors
const COLOR_IDLE = [0, 0, 0]; // Black — template image, macOS auto-inverts
const COLOR_ACTIVE = [64, 182, 251]; // #40B6FB — TARX blue
const COLOR_ERROR = [255, 50, 109]; // #FF326D — TARX pink
const COLOR_LOADING = [0, 0, 0]; // Black but dimmed alpha

/**
 * Generate points for a 5-point star centered at (cx, cy)
 * @param {number} cx - center x
 * @param {number} cy - center y
 * @param {number} outerR - outer radius (tip of points)
 * @param {number} innerR - inner radius (between points)
 * @returns {Array<[number, number]>} polygon vertices
 */
function starPoints(cx, cy, outerR, innerR) {
	const points = [];
	const step = Math.PI / 5; // 36 degrees
	const offset = -Math.PI / 2; // Start from top
	for (let i = 0; i < 10; i++) {
		const r = i % 2 === 0 ? outerR : innerR;
		const angle = offset + i * step;
		points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
	}
	return points;
}

/**
 * Test if point (px, py) is inside polygon using ray-casting
 * @param {number} px
 * @param {number} py
 * @param {Array<[number, number]>} polygon
 * @returns {boolean}
 */
function pointInPolygon(px, py, polygon) {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i][0], yi = polygon[i][1];
		const xj = polygon[j][0], yj = polygon[j][1];
		if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

/**
 * Compute coverage of a pixel for anti-aliasing (4x4 supersampling)
 * @param {number} x - pixel x
 * @param {number} y - pixel y
 * @param {Array<[number, number]>} polygon
 * @returns {number} 0.0 to 1.0 coverage
 */
function pixelCoverage(x, y, polygon) {
	const samples = 4;
	let hits = 0;
	for (let sy = 0; sy < samples; sy++) {
		for (let sx = 0; sx < samples; sx++) {
			const px = x + (sx + 0.5) / samples;
			const py = y + (sy + 0.5) / samples;
			if (pointInPolygon(px, py, polygon)) {
				hits++;
			}
		}
	}
	return hits / (samples * samples);
}

/**
 * Create a star icon as nativeImage
 * @param {'idle' | 'active' | 'error' | 'loading'} state
 * @returns {Electron.NativeImage}
 */
function createStarIcon(state) {
	const buf = Buffer.alloc(SIZE * SIZE * 4, 0);

	const cx = SIZE / 2;
	const cy = SIZE / 2;
	const outerR = 13; // Star tip radius
	const innerR = 5.5; // Star valley radius
	const polygon = starPoints(cx, cy, outerR, innerR);

	let rgb, baseAlpha, isTemplate;

	switch (state) {
		case 'active':
			rgb = COLOR_ACTIVE;
			baseAlpha = 255;
			isTemplate = false;
			break;
		case 'error':
			rgb = COLOR_ERROR;
			baseAlpha = 255;
			isTemplate = false;
			break;
		case 'loading':
			rgb = COLOR_LOADING;
			baseAlpha = 80;
			isTemplate = true;
			break;
		case 'idle':
		default:
			rgb = COLOR_IDLE;
			baseAlpha = 255;
			isTemplate = true;
			break;
	}

	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) {
			const coverage = pixelCoverage(x, y, polygon);
			if (coverage > 0) {
				const i = (y * SIZE + x) * 4;
				buf[i] = rgb[0];
				buf[i + 1] = rgb[1];
				buf[i + 2] = rgb[2];
				buf[i + 3] = Math.round(baseAlpha * coverage);
			}
		}
	}

	const img = nativeImage.createFromBuffer(buf, { width: SIZE, height: SIZE, scaleFactor: SCALE });
	if (isTemplate) {
		img.setTemplateImage(true);
	}
	return img;
}

// Pre-render all states at module load
let icons = null;

function getIcons() {
	if (!icons) {
		icons = {
			idle: createStarIcon('idle'),
			active: createStarIcon('active'),
			error: createStarIcon('error'),
			loading: createStarIcon('loading'),
		};
	}
	return icons;
}

/**
 * Get the appropriate icon for a health state
 * @param {'healthy' | 'degraded' | 'offline' | 'unknown'} status
 * @returns {Electron.NativeImage}
 */
function iconForStatus(status) {
	const ic = getIcons();
	switch (status) {
		case 'healthy': return ic.active;
		case 'degraded': return ic.active; // Still blue when partially up
		case 'offline': return ic.error;
		case 'unknown': return ic.loading;
		default: return ic.idle;
	}
}

module.exports = { createStarIcon, iconForStatus, getIcons };

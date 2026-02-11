/**
 * Tests for TARX Skill Resolver
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { parseFrontmatter } from '../skillResolver.js';
import type { SkillFrontmatter, AgentFrontmatter } from '../types.js';

describe('parseFrontmatter', () => {
	it('parses basic skill frontmatter', () => {
		const content = `---
name: test-skill
description: "A test skill"
route: local
tier: free
---

# Test Skill

Some instructions here.`;

		const { frontmatter, body } = parseFrontmatter<SkillFrontmatter>(content);
		assert.equal(frontmatter.name, 'test-skill');
		assert.equal(frontmatter.description, 'A test skill');
		assert.equal(frontmatter.route, 'local');
		assert.equal(frontmatter.tier, 'free');
		assert.ok(body.includes('# Test Skill'));
		assert.ok(body.includes('Some instructions here.'));
	});

	it('parses array tools in block format', () => {
		const content = `---
name: test-skill
description: "Test"
route: local
tools:
  - tool_one
  - tool_two
  - tool_three
tier: free
---

Body.`;

		const { frontmatter } = parseFrontmatter<SkillFrontmatter>(content);
		assert.deepEqual(frontmatter.tools, ['tool_one', 'tool_two', 'tool_three']);
	});

	it('parses inline array format', () => {
		const content = `---
name: test-skill
description: "Test"
route: local
tools: [tool_one, tool_two]
tier: free
---

Body.`;

		const { frontmatter } = parseFrontmatter<SkillFrontmatter>(content);
		assert.deepEqual(frontmatter.tools, ['tool_one', 'tool_two']);
	});

	it('parses agent frontmatter with skills list', () => {
		const content = `---
name: test-agent
description: "A test agent"
skills:
  - skill-one
  - skill-two
mode: local
---

Agent instructions.`;

		const { frontmatter } = parseFrontmatter<AgentFrontmatter>(content);
		assert.equal(frontmatter.name, 'test-agent');
		assert.equal(frontmatter.mode, 'local');
		assert.deepEqual(frontmatter.skills, ['skill-one', 'skill-two']);
	});

	it('throws on missing frontmatter', () => {
		assert.throws(() => {
			parseFrontmatter('No frontmatter here');
		}, /No YAML frontmatter found/);
	});

	it('handles quoted values', () => {
		const content = `---
name: "quoted-name"
description: "A quoted description"
route: local
tier: free
---

Body.`;

		const { frontmatter } = parseFrontmatter<SkillFrontmatter>(content);
		assert.equal(frontmatter.name, 'quoted-name');
		assert.equal(frontmatter.description, 'A quoted description');
	});
});

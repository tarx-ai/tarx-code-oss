// TARX Learning Project - JavaScript/API Patterns
// Demonstrates async/await, error handling, and API patterns

/**
 * Fetch a single user by ID.
 *
 * TARX TIP: This is a simple fetch without error handling.
 * Try: "What happens if the network fails?"
 *
 * @param {number} userId - The user ID to fetch
 * @returns {Promise<Object>} The user data
 */
async function fetchUser(userId) {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
}

/**
 * Fetch a user with proper error handling.
 *
 * TARX will notice this handles errors properly.
 * Try: "Add retry logic to this function"
 *
 * @param {number} userId - The user ID to fetch
 * @returns {Promise<Object|null>} The user data or null on error
 */
async function fetchUserSafe(userId) {
  try {
    const response = await fetch(`/api/users/${userId}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch user ${userId}:`, error.message);
    return null;
  }
}

/**
 * Fetch multiple users in parallel.
 *
 * TARX TIP: Promise.all is efficient but fails fast.
 * Try: "What if I want all results even if some fail?"
 *
 * @param {number[]} userIds - Array of user IDs to fetch
 * @returns {Promise<Object[]>} Array of user data
 */
async function fetchUsers(userIds) {
  const promises = userIds.map(id => fetchUserSafe(id));
  return Promise.all(promises);
}

/**
 * Fetch users with individual error handling.
 *
 * Uses Promise.allSettled to get all results.
 *
 * @param {number[]} userIds - Array of user IDs to fetch
 * @returns {Promise<{fulfilled: Object[], rejected: Error[]}>}
 */
async function fetchUsersSettled(userIds) {
  const results = await Promise.allSettled(
    userIds.map(id => fetchUserSafe(id))
  );

  return {
    fulfilled: results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value),
    rejected: results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason)
  };
}

/**
 * Create a new user.
 *
 * TARX TIP: POST requests need proper headers.
 * Try: "Add validation for userData"
 *
 * @param {Object} userData - The user data to create
 * @returns {Promise<Object>} The created user
 */
async function createUser(userData) {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create user');
  }

  return response.json();
}

/**
 * Update a user with PATCH.
 *
 * @param {number} userId - The user ID to update
 * @param {Object} updates - The fields to update
 * @returns {Promise<Object>} The updated user
 */
async function updateUser(userId, updates) {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Failed to update user ${userId}`);
  }

  return response.json();
}

/**
 * Delete a user.
 *
 * @param {number} userId - The user ID to delete
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteUser(userId) {
  const response = await fetch(`/api/users/${userId}`, {
    method: 'DELETE',
  });

  return response.ok;
}

// Main demonstration
async function main() {
  console.log('=== TARX Learning: API Patterns ===\n');

  // Demonstrate single fetch
  console.log('1. Fetching single user...');
  const user = await fetchUserSafe(1);
  console.log('User:', user);

  // Demonstrate parallel fetch
  console.log('\n2. Fetching multiple users...');
  const users = await fetchUsers([1, 2, 3]);
  console.log('Users:', users);

  // Demonstrate settled fetch
  console.log('\n3. Fetching with error handling...');
  const { fulfilled, rejected } = await fetchUsersSettled([1, 2, 999]);
  console.log('Succeeded:', fulfilled.length);
  console.log('Failed:', rejected.length);
}

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}

// Export for use as module
module.exports = {
  fetchUser,
  fetchUserSafe,
  fetchUsers,
  fetchUsersSettled,
  createUser,
  updateUser,
  deleteUser,
};

// Realistic Gen Z spending data for development/demo mode.
// Covers the emotional patterns Claude is designed to detect:
// late-night food delivery, weekend spikes, subscription creep, impulse buys.

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export function generateMockTransactions() {
  return [
    // Food delivery — spikes late at night and on weekends
    { id: 'mock_001', date: daysAgo(1),  name: 'DoorDash',         merchant: 'DoorDash',       amount: 34.87, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },
    { id: 'mock_002', date: daysAgo(2),  name: 'Uber Eats',        merchant: 'Uber Eats',      amount: 28.50, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },
    { id: 'mock_003', date: daysAgo(3),  name: 'Chipotle',         merchant: 'Chipotle',       amount: 14.25, category: 'FOOD_AND_DRINK',     subcategory: 'Restaurants',    channel: 'in store' },
    { id: 'mock_004', date: daysAgo(4),  name: 'DoorDash',         merchant: 'DoorDash',       amount: 41.20, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },
    { id: 'mock_005', date: daysAgo(5),  name: 'Starbucks',        merchant: 'Starbucks',      amount: 7.45,  category: 'FOOD_AND_DRINK',     subcategory: 'Coffee',         channel: 'in store' },
    { id: 'mock_006', date: daysAgo(6),  name: 'Starbucks',        merchant: 'Starbucks',      amount: 6.95,  category: 'FOOD_AND_DRINK',     subcategory: 'Coffee',         channel: 'in store' },
    { id: 'mock_007', date: daysAgo(7),  name: 'Sweetgreen',       merchant: 'Sweetgreen',     amount: 16.80, category: 'FOOD_AND_DRINK',     subcategory: 'Restaurants',    channel: 'in store' },
    { id: 'mock_008', date: daysAgo(8),  name: 'Uber Eats',        merchant: 'Uber Eats',      amount: 52.10, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },
    { id: 'mock_009', date: daysAgo(9),  name: 'Starbucks',        merchant: 'Starbucks',      amount: 8.20,  category: 'FOOD_AND_DRINK',     subcategory: 'Coffee',         channel: 'in store' },
    { id: 'mock_010', date: daysAgo(10), name: 'DoorDash',         merchant: 'DoorDash',       amount: 38.60, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },

    // Subscriptions — the slow bleed
    { id: 'mock_011', date: daysAgo(3),  name: 'Netflix',          merchant: 'Netflix',        amount: 15.49, category: 'ENTERTAINMENT',      subcategory: 'Streaming',      channel: 'online' },
    { id: 'mock_012', date: daysAgo(5),  name: 'Spotify',          merchant: 'Spotify',        amount: 9.99,  category: 'ENTERTAINMENT',      subcategory: 'Music',          channel: 'online' },
    { id: 'mock_013', date: daysAgo(8),  name: 'Hulu',             merchant: 'Hulu',           amount: 17.99, category: 'ENTERTAINMENT',      subcategory: 'Streaming',      channel: 'online' },
    { id: 'mock_014', date: daysAgo(12), name: 'Apple iCloud',     merchant: 'Apple',          amount: 2.99,  category: 'GENERAL_SERVICES',   subcategory: 'Cloud Storage',  channel: 'online' },
    { id: 'mock_015', date: daysAgo(15), name: 'ChatGPT Plus',     merchant: 'OpenAI',         amount: 20.00, category: 'GENERAL_SERVICES',   subcategory: 'Software',       channel: 'online' },
    { id: 'mock_016', date: daysAgo(18), name: 'YouTube Premium',  merchant: 'Google',         amount: 13.99, category: 'ENTERTAINMENT',      subcategory: 'Streaming',      channel: 'online' },
    { id: 'mock_017', date: daysAgo(22), name: 'Xbox Game Pass',   merchant: 'Microsoft',      amount: 14.99, category: 'ENTERTAINMENT',      subcategory: 'Gaming',         channel: 'online' },
    { id: 'mock_018', date: daysAgo(28), name: 'Amazon Prime',     merchant: 'Amazon',         amount: 14.99, category: 'GENERAL_SERVICES',   subcategory: 'Membership',     channel: 'online' },

    // Impulse / retail
    { id: 'mock_019', date: daysAgo(2),  name: 'SHEIN',            merchant: 'SHEIN',          amount: 67.40, category: 'SHOPS',              subcategory: 'Clothing',       channel: 'online' },
    { id: 'mock_020', date: daysAgo(6),  name: 'Amazon.com',       merchant: 'Amazon',         amount: 43.99, category: 'SHOPS',              subcategory: 'General',        channel: 'online' },
    { id: 'mock_021', date: daysAgo(9),  name: 'Amazon.com',       merchant: 'Amazon',         amount: 29.00, category: 'SHOPS',              subcategory: 'General',        channel: 'online' },
    { id: 'mock_022', date: daysAgo(11), name: 'Nike.com',         merchant: 'Nike',           amount: 110.00,category: 'SHOPS',              subcategory: 'Clothing',       channel: 'online' },
    { id: 'mock_023', date: daysAgo(14), name: 'Target',           merchant: 'Target',         amount: 58.32, category: 'SHOPS',              subcategory: 'General',        channel: 'in store' },
    { id: 'mock_024', date: daysAgo(20), name: 'Amazon.com',       merchant: 'Amazon',         amount: 89.99, category: 'SHOPS',              subcategory: 'Electronics',    channel: 'online' },

    // Weekend going out spike
    { id: 'mock_025', date: daysAgo(2),  name: 'Uber',             merchant: 'Uber',           amount: 22.40, category: 'TRANSPORTATION',     subcategory: 'Rideshare',      channel: 'online' },
    { id: 'mock_026', date: daysAgo(3),  name: 'Bar Tab - Venmo',  merchant: 'Venmo',          amount: 45.00, category: 'FOOD_AND_DRINK',     subcategory: 'Bars',           channel: 'online' },
    { id: 'mock_027', date: daysAgo(3),  name: 'Uber',             merchant: 'Uber',           amount: 18.90, category: 'TRANSPORTATION',     subcategory: 'Rideshare',      channel: 'online' },
    { id: 'mock_028', date: daysAgo(9),  name: 'Bar Tab',          merchant: 'Local Bar',      amount: 62.00, category: 'FOOD_AND_DRINK',     subcategory: 'Bars',           channel: 'in store' },
    { id: 'mock_029', date: daysAgo(10), name: 'Uber',             merchant: 'Uber',           amount: 31.20, category: 'TRANSPORTATION',     subcategory: 'Rideshare',      channel: 'online' },

    // Gym / wellness
    { id: 'mock_030', date: daysAgo(5),  name: 'Equinox',          merchant: 'Equinox',        amount: 49.00, category: 'GENERAL_SERVICES',   subcategory: 'Gyms',           channel: 'in store' },

    // Groceries (the responsible spending)
    { id: 'mock_031', date: daysAgo(7),  name: 'Trader Joe\'s',    merchant: "Trader Joe's",   amount: 73.20, category: 'SHOPS',              subcategory: 'Groceries',      channel: 'in store' },
    { id: 'mock_032', date: daysAgo(21), name: 'Whole Foods',      merchant: 'Whole Foods',    amount: 94.50, category: 'SHOPS',              subcategory: 'Groceries',      channel: 'in store' },
    { id: 'mock_033', date: daysAgo(35), name: 'Trader Joe\'s',    merchant: "Trader Joe's",   amount: 68.90, category: 'SHOPS',              subcategory: 'Groceries',      channel: 'in store' },

    // Rent (fixed)
    { id: 'mock_034', date: daysAgo(15), name: 'Zelle - Rent',     merchant: 'Zelle',          amount: 1200.00, category: 'RENT_AND_UTILITIES', subcategory: 'Rent',         channel: 'online' },
    { id: 'mock_035', date: daysAgo(45), name: 'Zelle - Rent',     merchant: 'Zelle',          amount: 1200.00, category: 'RENT_AND_UTILITIES', subcategory: 'Rent',         channel: 'online' },

    // Utilities
    { id: 'mock_036', date: daysAgo(18), name: 'Con Edison',       merchant: 'Con Edison',     amount: 87.00, category: 'RENT_AND_UTILITIES', subcategory: 'Electric',       channel: 'online' },
    { id: 'mock_037', date: daysAgo(20), name: 'T-Mobile',         merchant: 'T-Mobile',       amount: 55.00, category: 'RENT_AND_UTILITIES', subcategory: 'Phone',          channel: 'online' },

    // Late-night purchases (the emotional tells)
    { id: 'mock_038', date: daysAgo(4),  name: 'Amazon.com',       merchant: 'Amazon',         amount: 34.99, category: 'SHOPS',              subcategory: 'General',        channel: 'online' },
    { id: 'mock_039', date: daysAgo(13), name: 'ASOS',             merchant: 'ASOS',           amount: 78.00, category: 'SHOPS',              subcategory: 'Clothing',       channel: 'online' },
    { id: 'mock_040', date: daysAgo(17), name: 'DoorDash',         merchant: 'DoorDash',       amount: 47.30, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },

    // Older transactions (30-60 days)
    { id: 'mock_041', date: daysAgo(32), name: 'DoorDash',         merchant: 'DoorDash',       amount: 29.40, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },
    { id: 'mock_042', date: daysAgo(36), name: 'Uber Eats',        merchant: 'Uber Eats',      amount: 38.20, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },
    { id: 'mock_043', date: daysAgo(38), name: 'Amazon.com',       merchant: 'Amazon',         amount: 56.99, category: 'SHOPS',              subcategory: 'General',        channel: 'online' },
    { id: 'mock_044', date: daysAgo(41), name: 'Starbucks',        merchant: 'Starbucks',      amount: 7.80,  category: 'FOOD_AND_DRINK',     subcategory: 'Coffee',         channel: 'in store' },
    { id: 'mock_045', date: daysAgo(44), name: 'Netflix',          merchant: 'Netflix',        amount: 15.49, category: 'ENTERTAINMENT',      subcategory: 'Streaming',      channel: 'online' },
    { id: 'mock_046', date: daysAgo(47), name: 'Sephora',          merchant: 'Sephora',        amount: 92.00, category: 'SHOPS',              subcategory: 'Beauty',         channel: 'in store' },
    { id: 'mock_047', date: daysAgo(50), name: 'DoorDash',         merchant: 'DoorDash',       amount: 33.10, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },
    { id: 'mock_048', date: daysAgo(53), name: 'Ticketmaster',     merchant: 'Ticketmaster',   amount: 145.00,category: 'ENTERTAINMENT',      subcategory: 'Events',         channel: 'online' },
    { id: 'mock_049', date: daysAgo(56), name: 'Apple App Store',  merchant: 'Apple',          amount: 12.99, category: 'ENTERTAINMENT',      subcategory: 'Apps',           channel: 'online' },
    { id: 'mock_050', date: daysAgo(59), name: 'Uber Eats',        merchant: 'Uber Eats',      amount: 44.80, category: 'FOOD_AND_DRINK',     subcategory: 'Fast Food',      channel: 'online' },
  ];
}

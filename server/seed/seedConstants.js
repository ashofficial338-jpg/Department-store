export const CATEGORY_TREE = {
  Fashion: ["Men's", "Women's", 'Kids'],
  Electronics: ['Mobile', 'Laptop', 'Accessories'],
  Home: ['Furniture', 'Kitchen', 'Decor'],
  Beauty: ['Cosmetics', 'Skincare', 'Personal Care'],
};

export const BRANDS = [
  'Aurelia Signature', 'Northgate', 'Velour', 'Crestline', 'Marbelle',
  'Kadence', 'Solstice Home', 'Primrose & Co', 'Ironwave', 'Lumenext',
  'Tresor', 'Haven & Hearth', 'Cobalt Tech', 'Willowmere', 'Aurum Beauty',
];

export const PRODUCT_ADJECTIVES = ['Classic', 'Premium', 'Everyday', 'Signature', 'Deluxe', 'Essential', 'Urban', 'Heritage', 'Modern', 'Studio'];

export const PRODUCT_NOUNS = {
  "Men's": ['Formal Shirt', 'Casual Trousers', 'Denim Jacket', 'Polo T-Shirt', 'Leather Belt', 'Chino Pants', 'Sneakers', 'Wool Sweater'],
  "Women's": ['Kurti Set', 'Maxi Dress', 'Silk Saree', 'Denim Jeans', 'Handbag', 'Blazer', 'Jumpsuit', 'Stole'],
  Kids: ['Graphic T-Shirt', 'School Shoes', 'Winter Jacket', 'Cargo Shorts', 'Frock', 'Backpack'],
  Mobile: ['Smartphone 128GB', 'Wireless Earbuds', 'Fast Charger 33W', 'Tempered Glass Pack', 'Power Bank 10000mAh', 'Phone Case'],
  Laptop: ['14-inch Laptop', 'Wireless Mouse', 'Laptop Sleeve', 'USB-C Hub', 'Cooling Pad', 'Laptop Stand'],
  Accessories: ['Bluetooth Speaker', 'Smart Watch', 'USB Cable 1m', 'Wired Headphones', 'Camera Tripod'],
  Furniture: ['Study Table', 'Bookshelf', 'Office Chair', 'Bed Side Table', 'Wardrobe 3-Door', 'Sofa Cushion Set'],
  Kitchen: ['Non-Stick Pan Set', 'Steel Dinner Set', 'Electric Kettle', 'Mixer Grinder', 'Storage Container Set', 'Knife Set'],
  Decor: ['Wall Clock', 'Table Lamp', 'Photo Frame Set', 'Wall Art Canvas', 'Scented Candle Pack', 'Flower Vase'],
  Cosmetics: ['Matte Lipstick', 'Foundation SPF30', 'Eyeshadow Palette', 'Kajal Pack of 2', 'Nail Polish Set', 'Makeup Brush Set'],
  Skincare: ['Vitamin C Serum', 'Face Wash 150ml', 'Moisturizer SPF20', 'Sunscreen Gel', 'Face Mask Pack', 'Under-Eye Cream'],
  'Personal Care': ['Shampoo 400ml', 'Body Lotion 300ml', 'Hair Oil 200ml', 'Deodorant Spray', 'Hand Wash 250ml', 'Trimmer Kit'],
};

export const UNITS = ['PCS', 'SET', 'PACK', 'BOX'];

export const FIRST_NAMES = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Ishaan', 'Kabir', 'Ananya', 'Diya', 'Saanvi', 'Myra', 'Aadhya', 'Kiara', 'Priya', 'Neha', 'Rohan', 'Karthik', 'Meera', 'Anjali', 'Rahul', 'Sanjay', 'Pooja', 'Deepak', 'Nisha'];
export const LAST_NAMES = ['Sharma', 'Verma', 'Iyer', 'Nair', 'Reddy', 'Gupta', 'Menon', 'Rao', 'Kapoor', 'Joshi', 'Malhotra', 'Chatterjee', 'Pillai', 'Desai', 'Bhatt'];

export const CITIES = [
  { city: 'Chennai', state: 'Tamil Nadu' },
  { city: 'Bengaluru', state: 'Karnataka' },
  { city: 'Mumbai', state: 'Maharashtra' },
  { city: 'Hyderabad', state: 'Telangana' },
  { city: 'Pune', state: 'Maharashtra' },
  { city: 'Coimbatore', state: 'Tamil Nadu' },
];

export const EXPENSE_DESCRIPTIONS = {
  rent: ['Monthly store rent', 'Warehouse rent'],
  utilities: ['Electricity bill', 'Water bill', 'Internet & phone'],
  salaries: ['Staff salaries', 'Cashier overtime pay'],
  marketing: ['Festive season ad campaign', 'Social media promotion', 'In-store banners'],
  logistics: ['Courier & delivery charges', 'Fuel for delivery van'],
  maintenance: ['AC servicing', 'POS hardware repair', 'Store fixture repair'],
  supplies: ['Packaging material', 'Billing stationery', 'Cleaning supplies'],
  other: ['Bank charges', 'Miscellaneous office expense'],
};

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function randomFloat(min, max, decimals = 2) {
  const v = Math.random() * (max - min) + min;
  return Math.round(v * 10 ** decimals) / 10 ** decimals;
}
export function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}
export function pickMany(arr, n) {
  const copy = [...arr];
  const result = [];
  for (let i = 0; i < n && copy.length; i++) {
    result.push(copy.splice(randomInt(0, copy.length - 1), 1)[0]);
  }
  return result;
}
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
export function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export default { CATEGORY_TREE, BRANDS, PRODUCT_ADJECTIVES, PRODUCT_NOUNS, UNITS, FIRST_NAMES, LAST_NAMES, CITIES, EXPENSE_DESCRIPTIONS, randomInt, randomFloat, pick, pickMany, daysAgo, daysFromNow };

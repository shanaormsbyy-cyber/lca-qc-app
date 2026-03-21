// One-time script to insert real KOSH properties into the database
// Run with: node backend/add-properties.js
const db = require('./db');

const properties = [
  '12 Portal Crescent',
  '11 Steele Road',
  '11/182 London Street',
  '1/19 Taylor Terrace',
  '7/35 Selwyn Street, Tauranga',
  '1/10 Palmerston Street',
  '5/240 Old Farm Road',
  '10 Cook Street',
  '1/15 Beverley Crescent',
  '6/240 Old Farm Road',
  '74 Awatere Avenue',
  '2/15 Beverley Crescent',
  '1/3 Glen Lynne Avenue',
  '21 Mistry Place',
  '3/3 Glen Lynne Avenue',
  '16D Ridout Street',
  '45B Vercoe Road',
  '45A Vercoe Road',
  '11 Raddington Way',
  '11A Raddington Way',
  '1/120 Beerescourt Road',
  '2/2 Clematis Avenue',
  '22/182 London Street',
  '303/220 Tristram Street',
  '6A Shirley Place',
  '6 Shirley Place',
  '2/20 Hunter Street',
  '1/22 Willoughby Street',
  '5/22 Willoughby Street',
  '6/22 Willoughby Street',
  '3/19 Beale Street',
  '1/29 Palmerston Street',
  '16B Ridout Street',
  '77A Awatere Avenue',
  '163 River Road North',
  '163 River Road South',
  '7/182 London Street',
];

const insert = db.prepare('INSERT INTO properties (name, address, airbnb_id) VALUES (?, ?, ?)');

let added = 0;
for (const name of properties) {
  insert.run(name, '', '');
  console.log(`Added: ${name}`);
  added++;
}

console.log(`\nDone — ${added} properties added.`);

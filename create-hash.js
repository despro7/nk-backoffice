import bcrypt from 'bcryptjs';

const password = 'hk946WnYTr04';
const hash = bcrypt.hashSync(password, 10);

console.log('Password:', password);
console.log('Hash:', hash);

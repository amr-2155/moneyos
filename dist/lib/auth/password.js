import bcrypt from "bcryptjs";
const BCRYPT_ROUNDS = 12;
export function hashPassword(plain) {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
export function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}
//# sourceMappingURL=password.js.map
import { createSession } from "../lib/auth";

const email = process.argv[2] ?? "brawley1422@gmail.com";
const token = createSession(email);
console.log(token);

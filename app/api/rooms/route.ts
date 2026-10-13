import { env } from 'cloudflare:workers';
import { handleRoomRequest } from '../../../server/rooms.js';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handleRoomRequest(request,env.DB);}

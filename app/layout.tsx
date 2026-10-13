import type { Metadata } from 'next';
export const metadata:Metadata={title:'Pocket Drive — Arcade Football',description:'Retro football with solo exhibition and private online 1v1 rooms.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}

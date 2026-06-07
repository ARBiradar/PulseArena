import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PulseArena - Live Fan Engagement',
  description: 'Ultra-low latency live sports telemetry and interactive second-screen predictions'
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}

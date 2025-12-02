import Sidebar from "@/components/Sidebar";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100 overflow-auto">
      <Sidebar />
      <main className="md:ml-64 p-4 md:p-8 pt-16 md:pt-8 pb-8">
        {children}
      </main>
    </div>
  );
}

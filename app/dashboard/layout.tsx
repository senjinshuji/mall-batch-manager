import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100 overflow-auto">
      <Sidebar />
      <main className="md:ml-64 p-3 md:p-4 pt-14 md:pt-4 pb-4">
        {children}
      </main>
    </div>
  );
}

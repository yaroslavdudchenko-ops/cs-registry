import Link from "next/link";

export default function NotFound(): React.JSX.Element {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-xl border border-line bg-surface p-8">
        <h1 className="text-2xl font-semibold">Страница не найдена</h1>
        <p className="mt-3 text-muted">Проверьте адрес или вернитесь к списку систем.</p>
        <p className="mt-4">
          <Link href="/systems" className="text-accent hover:underline">
            К списку систем
          </Link>
        </p>
      </div>
    </main>
  );
}

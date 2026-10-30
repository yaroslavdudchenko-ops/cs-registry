import Link from "next/link";

export default function SystemNotFound(): React.JSX.Element {
  return (
    <section className="rounded-lg border border-line bg-surface p-8">
      <h1 className="text-2xl font-semibold">Система не найдена</h1>
      <p className="mt-3 text-muted">Записи с таким идентификатором нет в реестре.</p>
      <p className="mt-4">
        <Link href="/systems" className="text-accent hover:underline">
          К списку систем
        </Link>
      </p>
    </section>
  );
}

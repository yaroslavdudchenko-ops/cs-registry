export function Forbidden(): React.JSX.Element {
  return (
    <section className="rounded-lg border border-line bg-surface p-8">
      <h1 className="text-2xl font-semibold">Недостаточно прав для этого действия</h1>
      <p className="mt-3 max-w-xl text-muted">
        У вашей роли нет доступа к этому разделу. Если доступ нужен по работе, обратитесь к
        администратору реестра.
      </p>
    </section>
  );
}

interface Props {
  name: string;
  what: string;
  issue?: number;
}

export function NotBuiltPage({ name, what, issue }: Props) {
  return (
    <section className="page">
      <h1>{name}</h1>
      <p>{what}</p>
      {issue !== undefined && (
        <p className="muted">
          Not built yet:{" "}
          <a href={`https://github.com/fyralex/meta-analysis-atlas/issues/${String(issue)}`}>issue #{issue}</a>.
        </p>
      )}
    </section>
  );
}

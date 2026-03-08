import Link from "next/link";

export default function HomePage() {
  return (
    <section>
      <h1>WalkFlow</h1>
      <p>Phone-first capture flow for developer thoughts.</p>
      <p>
        <Link href="/login">Create account / Login</Link>
      </p>
      <p>
        <Link href="/dashboard">Open dashboard</Link>
      </p>
    </section>
  );
}

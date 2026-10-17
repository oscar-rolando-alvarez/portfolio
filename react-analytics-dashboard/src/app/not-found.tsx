import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Section not available</h1>
      <p className="max-w-md text-gray-600 dark:text-gray-400">
        This area of the dashboard is not part of the demo build yet. The overview page shows the
        implemented metrics, charts and insights.
      </p>
      <Link
        href="/"
        className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
      >
        Back to overview
      </Link>
    </div>
  );
}

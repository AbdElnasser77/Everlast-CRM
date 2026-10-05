import SegmentEditor from "@/components/SegmentEditor";

export default async function EditSegmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SegmentEditor segmentId={parseInt(id, 10)} />;
}

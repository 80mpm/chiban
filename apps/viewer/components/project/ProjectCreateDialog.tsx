"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useProjectMutations } from "@/hooks/use-projects";

/**
 * 新規案件モーダル（旧 list.js openProjectCreateForm）。
 * 案件名・概要のみ。作成後は案件編集画面へ遷移する。
 */
export function ProjectCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { createProject } = useProjectMutations();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  async function handleCreate() {
    setError("");
    const n = name.trim();
    if (!n) {
      setError("案件名は必須です");
      return;
    }
    try {
      const created = await createProject.mutateAsync({
        name: n,
        description: description.trim(),
        polygon: null,
      });
      toast.success("案件を作成しました");
      onOpenChange(false);
      router.push(`/projects/${encodeURIComponent(created.id)}/edit`);
    } catch (e) {
      setError(`作成に失敗しました: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新規案件</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="rounded-md border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="f-name">
              案件名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="f-name"
              autoFocus
              placeholder="例：川口駅東口案件"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-description">概要</Label>
            <Textarea
              id="f-description"
              placeholder="案件の概要・狙いなど"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              作成後、案件編集画面で領域ポリゴンや土地を設定できます。
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button onClick={handleCreate} disabled={createProject.isPending}>
            {createProject.isPending ? "作成中…" : "作成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

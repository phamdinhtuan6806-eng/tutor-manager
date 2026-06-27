"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserSettings } from "@/lib/types";
import { useLanguage } from "@/components/providers/LanguageProvider";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { t } = useLanguage();
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string>("");
  const [form, setForm] = useState({
    bank_name: "",
    bank_account_holder: "",
    bank_account_number: "",
    qr_image_url: "",
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .single();
        
      if (data) {
        setForm({
          bank_name: data.bank_name || "",
          bank_account_holder: data.bank_account_holder || "",
          bank_account_number: data.bank_account_number || "",
          qr_image_url: data.qr_image_url || "",
        });
        if (data.qr_image_url) {
          setQrPreview(data.qr_image_url);
        }
      }
    }
    setLoading(false);
  };

  const handleQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setQrFile(file);
      setQrPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Vui lòng đăng nhập lại");

      let qr_image_url = form.qr_image_url;
      if (qrFile) {
        const fileExt = qrFile.name.split(".").pop();
        const fileName = `public_qr/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("qr-images").upload(fileName, qrFile);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("qr-images").getPublicUrl(fileName);
          qr_image_url = urlData.publicUrl;
        }
      } else if (!qrPreview && form.qr_image_url) {
        // User deleted the image
        qr_image_url = "";
      }

      const { error } = await supabase.from("user_settings").upsert({
        user_id: user.id,
        bank_name: form.bank_name.trim() || null,
        bank_account_holder: form.bank_account_holder.trim() || null,
        bank_account_number: form.bank_account_number.trim() || null,
        qr_image_url: qr_image_url || null,
      });

      if (error) throw error;
      
      toast.success(t("common", "success"));
      setForm({ ...form, qr_image_url });
    } catch (error: any) {
      toast.error(t("common", "error") + ": " + (error.message || ""));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse-soft h-8 bg-muted rounded w-48 mb-6" />
        <Card className="animate-pulse-soft border-0 shadow-sm">
          <CardContent className="p-6 h-64 bg-muted rounded-xl" />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings", "title")}</h1>
        <p className="text-muted-foreground text-sm">{t("settings", "subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">{t("settings", "defaultTransferInfo")}</CardTitle>
            <CardDescription>
              {t("settings", "defaultTransferInfoDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bank_name">{t("settings", "bankName")}</Label>
                <Input id="bank_name" placeholder={t("settings", "bankNamePlaceholder") || "VD: Vietcombank, MB Bank"} value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account_holder">{t("settings", "accountHolder")}</Label>
                <Input id="bank_account_holder" placeholder={t("settings", "accountHolderPlaceholder") || "VD: NGUYEN VAN A"} value={form.bank_account_holder}
                  onChange={(e) => setForm({ ...form, bank_account_holder: e.target.value })} className="h-11" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="bank_account_number">{t("settings", "accountNumber")}</Label>
                <Input id="bank_account_number" placeholder={t("settings", "accountNumberPlaceholder") || "VD: 0123456789"} value={form.bank_account_number}
                  onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} className="h-11" />
              </div>
            </div>

            <div className="space-y-2 pt-4">
              <Label>{t("settings", "defaultQr")}</Label>
              <div className="flex items-start gap-4">
                <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  {qrPreview ? (
                    <img src={qrPreview} alt="QR" className="w-full h-full object-contain rounded-xl" />
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mb-1">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />
                      </svg>
                      <span className="text-xs text-muted-foreground text-center px-2">{t("settings", "uploadQr")}</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleQrChange} />
                </label>
                {qrPreview && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setQrFile(null); setQrPreview(""); }} className="text-destructive mt-1">
                    {t("settings", "deleteImage")}
                  </Button>
                )}
              </div>
            </div>
            
            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={saving} className="min-w-[120px] shadow-md shadow-primary/20">
                {saving ? t("settings", "saving") : t("settings", "saveChanges")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

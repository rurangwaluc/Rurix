"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  FileText,
  Mail,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  Truck,
  X,
} from "lucide-react";

import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  listSuppliers,
  markPurchaseOrderOrdered,
  receivePurchaseOrder,
  sendPurchaseOrder,
  updatePurchaseOrder,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderReceipt,
  type PurchaseOrderReceiptItem,
  type PurchaseOrderSendEvent,
  type PurchaseOrderStatus,
  type Supplier,
} from "../../../lib/inventory-api";
import type { CatalogItem, CurrentUserResponse } from "../../../lib/api";
import { StatusBadge } from "../../status-badge";

type PurchaseOrdersPanelProps = {
  search: string;
  refreshKey: number;
  branches: CurrentUserResponse["branches"];
  products: CatalogItem[];
  canCreatePurchaseOrder: boolean;
  canUpdatePurchaseOrder: boolean;
  canMarkPurchaseOrderOrdered: boolean;
  canCancelPurchaseOrder: boolean;
  canReceivePurchaseOrder: boolean;
  canSendPurchaseOrder: boolean;
};

type PurchaseOrderLineForm = {
  tempId: string;
  itemId: string;
  quantityOrdered: string;
  expectedUnitCost: string;
  note: string;
};

type PurchaseOrderForm = {
  supplierId: string;
  deliveryBranchId: string;
  expectedDeliveryDate: string;
  notes: string;
  items: PurchaseOrderLineForm[];
};

type SelectedPurchaseOrder = {
  purchaseOrder: PurchaseOrder;
  items: PurchaseOrderItem[];
  receipts: PurchaseOrderReceipt[];
  receiptItems: PurchaseOrderReceiptItem[];
  sendEvents: PurchaseOrderSendEvent[];
};

type ReceiveForm = {
  receivedBranchId: string;
  note: string;
  items: Record<
    string,
    {
      quantityReceived: string;
      actualUnitCost: string;
      note: string;
    }
  >;
};

type SendForm = {
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  subject: string;
  message: string;
};

type PurchaseOrderSummaryView = Awaited<
  ReturnType<typeof listPurchaseOrders>
>["purchaseOrders"][number];

const initialLineItem: PurchaseOrderLineForm = {
  tempId: "line-1",
  itemId: "",
  quantityOrdered: "1",
  expectedUnitCost: "",
  note: "",
};

const initialOrderForm: PurchaseOrderForm = {
  supplierId: "",
  deliveryBranchId: "",
  expectedDeliveryDate: "",
  notes: "",
  items: [initialLineItem],
};

const initialSendForm: SendForm = {
  recipientName: "",
  recipientEmail: "",
  recipientPhone: "",
  subject: "",
  message: "",
};

export function PurchaseOrdersPanel({
  search,
  refreshKey,
  branches,
  products,
  canCreatePurchaseOrder,
  canUpdatePurchaseOrder,
  canMarkPurchaseOrderOrdered,
  canCancelPurchaseOrder,
  canReceivePurchaseOrder,
  canSendPurchaseOrder,
}: PurchaseOrdersPanelProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderSummaryView[]>([]);
  const [selectedOrder, setSelectedOrder] =
    useState<SelectedPurchaseOrder | null>(null);

  const [form, setForm] = useState<PurchaseOrderForm>(initialOrderForm);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [receiveForm, setReceiveForm] = useState<ReceiveForm>({
    receivedBranchId: branches[0]?.id || "",
    note: "",
    items: {},
  });

  const [sendForm, setSendForm] = useState<SendForm>(initialSendForm);
  const [cancelReason, setCancelReason] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isOpeningOrder, setIsOpeningOrder] = useState(false);
  const [isMarkingOrdered, setIsMarkingOrdered] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [sendingMethod, setSendingMethod] = useState<
    "pdf_download" | "email" | "whatsapp" | ""
  >("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.status === "active"),
    [suppliers],
  );

  const activeProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.kind === "PRODUCT" &&
          product.trackStock &&
          product.status === "active",
      ),
    [products],
  );

  const draftCount = useMemo(
    () => orders.filter((order) => order.status === "draft").length,
    [orders],
  );

  const openOrderCount = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status === "ordered" || order.status === "partly_received",
      ).length,
    [orders],
  );

  const fullyReceivedCount = useMemo(
    () => orders.filter((order) => order.status === "fully_received").length,
    [orders],
  );

  useEffect(() => {
    void reloadPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, refreshKey]);

  async function reloadPanel(preferredOrderId?: string) {
    setIsLoading(true);
    setError("");

    try {
      const orderParams: Parameters<typeof listPurchaseOrders>[0] = {};
      const searchValue = search.trim();

      if (searchValue) {
        orderParams.search = searchValue;
      }

      const [supplierResult, orderResult] = await Promise.all([
        listSuppliers({ status: "active" }),
        listPurchaseOrders(orderParams),
      ]);

      setSuppliers(supplierResult.suppliers);
      setOrders(orderResult.purchaseOrders);

      const firstActiveProduct = products.find(
        (product) =>
          product.kind === "PRODUCT" &&
          product.trackStock &&
          product.status === "active",
      );

      setForm((current) => ({
        ...current,
        supplierId: current.supplierId || supplierResult.suppliers[0]?.id || "",
        deliveryBranchId:
          current.deliveryBranchId ||
          branches.find((branch) => branch.is_main)?.id ||
          branches[0]?.id ||
          "",
        items: current.items.map((item, index) => ({
          ...item,
          tempId: item.tempId || `line-${index + 1}`,
          itemId: item.itemId || firstActiveProduct?.id || "",
        })),
      }));

      const orderToOpen =
        orderResult.purchaseOrders.find(
          (order) => order.id === preferredOrderId,
        ) ||
        orderResult.purchaseOrders.find(
          (order) => order.id === selectedOrder?.purchaseOrder.id,
        ) ||
        orderResult.purchaseOrders[0];

      if (orderToOpen) {
        await loadSelectedOrder(orderToOpen.id);
      } else {
        setSelectedOrder(null);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load purchase orders.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function loadSelectedOrder(orderId: string) {
    const result = await getPurchaseOrder(orderId);

    setSelectedOrder({
      purchaseOrder: result.purchaseOrder,
      items: result.items,
      receipts: result.receipts,
      receiptItems: result.receiptItems,
      sendEvents: result.sendEvents,
    });

    setSendForm({
      recipientName: result.purchaseOrder.supplierContactPerson || "",
      recipientEmail: result.purchaseOrder.supplierEmail || "",
      recipientPhone: result.purchaseOrder.supplierPhone || "",
      subject: `Purchase order ${result.purchaseOrder.orderNumber}`,
      message: "",
    });

    setReceiveForm({
      receivedBranchId:
        result.purchaseOrder.deliveryBranchId ||
        branches.find((branch) => branch.is_main)?.id ||
        branches[0]?.id ||
        "",
      note: "",
      items: buildReceiveItems(result.items),
    });

    setCancelReason("");
  }

  async function openOrder(orderId: string) {
    setIsOpeningOrder(true);
    setError("");
    setSuccess("");

    try {
      await loadSelectedOrder(orderId);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not open purchase order.",
      );
    } finally {
      setIsOpeningOrder(false);
    }
  }

  function openCreateForm() {
    setEditingOrderId("");
    setForm({
      ...initialOrderForm,
      supplierId: activeSuppliers[0]?.id || "",
      deliveryBranchId:
        branches.find((branch) => branch.is_main)?.id || branches[0]?.id || "",
      items: [
        {
          ...initialLineItem,
          tempId: `line-${Date.now()}`,
          itemId: activeProducts[0]?.id || "",
        },
      ],
    });
    setIsFormOpen(true);
    setError("");
    setSuccess("");
  }

  function openEditForm(order: SelectedPurchaseOrder) {
    if (order.purchaseOrder.status !== "draft") {
      setError("Only draft purchase orders can be changed.");
      return;
    }

    setEditingOrderId(order.purchaseOrder.id);
    setForm({
      supplierId: order.purchaseOrder.supplierId,
      deliveryBranchId: order.purchaseOrder.deliveryBranchId || "",
      expectedDeliveryDate: order.purchaseOrder.expectedDeliveryDate
        ? order.purchaseOrder.expectedDeliveryDate.slice(0, 10)
        : "",
      notes: order.purchaseOrder.notes || "",
      items: order.items.map((item) => ({
        tempId: item.id,
        itemId: item.itemId,
        quantityOrdered: String(item.quantityOrdered),
        expectedUnitCost:
          item.expectedUnitCostCents === null
            ? ""
            : fromCents(item.expectedUnitCostCents),
        note: item.note || "",
      })),
    });
    setIsFormOpen(true);
    setError("");
    setSuccess("");
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingOrderId("");
    setForm(initialOrderForm);
  }

  async function handleSaveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingOrderId && !canCreatePurchaseOrder) {
      setError("You do not have access to create purchase orders.");
      return;
    }

    if (editingOrderId && !canUpdatePurchaseOrder) {
      setError("You do not have access to update purchase orders.");
      return;
    }

    const payload = buildPurchaseOrderPayload(form);

    if (!payload.supplierId) {
      setError("Choose a supplier.");
      return;
    }

    if (!payload.items.length) {
      setError("Add at least one product.");
      return;
    }

    setIsSavingOrder(true);
    setError("");
    setSuccess("");

    try {
      const result = editingOrderId
        ? await updatePurchaseOrder(editingOrderId, payload)
        : await createPurchaseOrder(payload);

      setSuccess(
        editingOrderId
          ? "Purchase order updated successfully."
          : "Draft purchase order created successfully.",
      );

      closeForm();
      await reloadPanel(result.purchaseOrder.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save purchase order.",
      );
    } finally {
      setIsSavingOrder(false);
    }
  }

  async function handleMarkOrdered() {
    if (!selectedOrder) return;

    if (!canMarkPurchaseOrderOrdered) {
      setError("You do not have access to mark purchase orders as ordered.");
      return;
    }

    setIsMarkingOrdered(true);
    setError("");
    setSuccess("");

    try {
      await markPurchaseOrderOrdered(selectedOrder.purchaseOrder.id, {});
      setSuccess("Purchase order marked as ordered.");
      await reloadPanel(selectedOrder.purchaseOrder.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not mark purchase order as ordered.",
      );
    } finally {
      setIsMarkingOrdered(false);
    }
  }

  async function handleCancelOrder() {
    if (!selectedOrder) return;

    if (!canCancelPurchaseOrder) {
      setError("You do not have access to cancel purchase orders.");
      return;
    }

    const reason = cancelReason.trim();

    if (!reason) {
      setError("Add a cancellation reason.");
      return;
    }

    setIsCancelling(true);
    setError("");
    setSuccess("");

    try {
      await cancelPurchaseOrder(selectedOrder.purchaseOrder.id, {
        reason,
      });
      setSuccess("Purchase order cancelled.");
      await reloadPanel(selectedOrder.purchaseOrder.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not cancel purchase order.",
      );
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleReceiveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrder) return;

    if (!canReceivePurchaseOrder) {
      setError("You do not have access to receive purchase orders.");
      return;
    }

    const payloadItems = selectedOrder.items
      .map((item) => {
        const row = receiveForm.items[item.id];
        const quantityReceived = toInt(row?.quantityReceived || "");

        if (quantityReceived <= 0) {
          return null;
        }

        const payloadItem: {
          purchaseOrderItemId: string;
          quantityReceived: number;
          actualUnitCostCents?: number;
          note?: string;
        } = {
          purchaseOrderItemId: item.id,
          quantityReceived,
        };

        const actualUnitCost = row?.actualUnitCost.trim() || "";
        const note = row?.note.trim() || "";

        if (actualUnitCost) {
          payloadItem.actualUnitCostCents = toCents(actualUnitCost);
        }

        if (note) {
          payloadItem.note = note;
        }

        return payloadItem;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (!payloadItems.length) {
      setError("Enter received quantity for at least one product.");
      return;
    }

    setIsReceiving(true);
    setError("");
    setSuccess("");

    try {
      const payload: Parameters<typeof receivePurchaseOrder>[1] = {
        receivedBranchId: receiveForm.receivedBranchId,
        items: payloadItems,
      };

      const note = receiveForm.note.trim();

      if (note) {
        payload.note = note;
      }

      await receivePurchaseOrder(selectedOrder.purchaseOrder.id, payload);
      setSuccess("Purchase order stock received.");
      await reloadPanel(selectedOrder.purchaseOrder.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not receive purchase order stock.",
      );
    } finally {
      setIsReceiving(false);
    }
  }

  async function handleSendOrder(
    method: "pdf_download" | "email" | "whatsapp",
  ) {
    if (!selectedOrder) return;

    if (!canSendPurchaseOrder) {
      setError("You do not have access to send purchase orders.");
      return;
    }

    setSendingMethod(method);
    setError("");
    setSuccess("");

    try {
      const payload: Parameters<typeof sendPurchaseOrder>[1] = {
        method,
      };

      const recipientName = sendForm.recipientName.trim();
      const recipientEmail = sendForm.recipientEmail.trim();
      const recipientPhone = sendForm.recipientPhone.trim();
      const subject = sendForm.subject.trim();
      const message = sendForm.message.trim();

      if (recipientName) payload.recipientName = recipientName;
      if (recipientEmail) payload.recipientEmail = recipientEmail;
      if (recipientPhone) payload.recipientPhone = recipientPhone;
      if (subject) payload.subject = subject;
      if (message) payload.message = message;

      const result = await sendPurchaseOrder(
        selectedOrder.purchaseOrder.id,
        payload,
      );

      if (method === "whatsapp" && result.whatsappUrl) {
        window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
      }

      setSuccess(
        method === "email" && result.sendEvent.status === "not_configured"
          ? "Email sending is not configured, but the send event was recorded."
          : "Purchase order send event recorded.",
      );

      await loadSelectedOrder(selectedOrder.purchaseOrder.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not record send event.",
      );
    } finally {
      setSendingMethod("");
    }
  }

  return (
    <section className="space-y-4">
      <section className="overflow-hidden rounded-section border border-border bg-surface shadow-card">
        <div className="relative p-4 sm:p-5">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative grid gap-5 xl:grid-cols-[1fr_auto] xl:items-center">
            <div>
              <StatusBadge variant="primary">Supplier orders</StatusBadge>
              <h2 className="mt-3 text-2xl font-black sm:text-3xl">
                Purchase orders
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
                Prepare supplier orders, mark them as ordered, share them with
                suppliers, and receive stock into the right location.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[480px]">
              <SummaryCard label="Orders" value={orders.length} />
              <SummaryCard label="Drafts" value={draftCount} />
              <SummaryCard label="Completed" value={fullyReceivedCount} />
            </div>
          </div>

          <div className="relative mt-5 grid gap-2 sm:grid-cols-[1fr_1fr] xl:grid-cols-[220px_1fr_260px]">
            <button
              type="button"
              onClick={() => void reloadPanel(selectedOrder?.purchaseOrder.id)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-foreground transition hover:border-primary/50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh orders
            </button>

            <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-bold text-muted-foreground">
              Open orders:{" "}
              <span className="font-black text-foreground">
                {openOrderCount.toLocaleString()}
              </span>
            </div>

            {canCreatePurchaseOrder ? (
              <button
                type="button"
                onClick={openCreateForm}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 sm:col-span-2 xl:col-span-1"
              >
                <Plus className="h-4 w-4" />
                Create purchase order
              </button>
            ) : (
              <PermissionCard message="You can view purchase orders, but you cannot create them." />
            )}
          </div>
        </div>
      </section>

      {error ? <AlertCard tone="danger" message={error} /> : null}
      {success ? <AlertCard tone="success" message={success} /> : null}

      {isFormOpen ? (
        <PurchaseOrderFormCard
          form={form}
          suppliers={activeSuppliers}
          branches={branches}
          products={activeProducts}
          editingOrderId={editingOrderId}
          isSaving={isSavingOrder}
          onChange={setForm}
          onClose={closeForm}
          onSubmit={handleSaveOrder}
        />
      ) : null}

      {isLoading ? <PurchaseOrderSkeleton /> : null}

      {!isLoading && orders.length === 0 ? (
        <EmptyPurchaseOrderState
          search={search}
          canCreatePurchaseOrder={canCreatePurchaseOrder}
          onCreate={openCreateForm}
        />
      ) : null}

      {!isLoading && orders.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.35fr)]">
          <section className="space-y-3">
            <div className="rounded-3xl border border-border bg-surface p-4 shadow-soft">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-black">Order list</p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">
                    Choose an order to open the command center.
                  </p>
                </div>
                <StatusBadge variant="primary">
                  {orders.length.toLocaleString()} shown
                </StatusBadge>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
              {orders.map((order) => (
                <PurchaseOrderCard
                  key={order.id}
                  order={order}
                  isOpening={isOpeningOrder}
                  isSelected={selectedOrder?.purchaseOrder.id === order.id}
                  onOpen={() => void openOrder(order.id)}
                />
              ))}
            </div>
          </section>

          <PurchaseOrderCommandCenter
            selectedOrder={selectedOrder}
            branches={branches}
            receiveForm={receiveForm}
            sendForm={sendForm}
            cancelReason={cancelReason}
            isMarkingOrdered={isMarkingOrdered}
            isCancelling={isCancelling}
            isReceiving={isReceiving}
            sendingMethod={sendingMethod}
            canUpdatePurchaseOrder={canUpdatePurchaseOrder}
            canMarkPurchaseOrderOrdered={canMarkPurchaseOrderOrdered}
            canCancelPurchaseOrder={canCancelPurchaseOrder}
            canReceivePurchaseOrder={canReceivePurchaseOrder}
            canSendPurchaseOrder={canSendPurchaseOrder}
            onEdit={() => {
              if (selectedOrder) {
                openEditForm(selectedOrder);
              }
            }}
            onMarkOrdered={() => void handleMarkOrdered()}
            onCancel={() => void handleCancelOrder()}
            onReceive={handleReceiveOrder}
            onSend={(method) => void handleSendOrder(method)}
            onReceiveFormChange={setReceiveForm}
            onSendFormChange={setSendForm}
            onCancelReasonChange={setCancelReason}
          />
        </section>
      ) : null}
    </section>
  );
}

function PurchaseOrderFormCard({
  form,
  suppliers,
  branches,
  products,
  editingOrderId,
  isSaving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: PurchaseOrderForm;
  suppliers: Supplier[];
  branches: CurrentUserResponse["branches"];
  products: CatalogItem[];
  editingOrderId: string;
  isSaving: boolean;
  onChange: (value: PurchaseOrderForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  function updateLine(tempId: string, changes: Partial<PurchaseOrderLineForm>) {
    onChange({
      ...form,
      items: form.items.map((item) =>
        item.tempId === tempId ? { ...item, ...changes } : item,
      ),
    });
  }

  function addLine() {
    onChange({
      ...form,
      items: [
        ...form.items,
        {
          tempId: `line-${Date.now()}`,
          itemId: products[0]?.id || "",
          quantityOrdered: "1",
          expectedUnitCost: "",
          note: "",
        },
      ],
    });
  }

  function removeLine(tempId: string) {
    if (form.items.length <= 1) {
      return;
    }

    onChange({
      ...form,
      items: form.items.filter((item) => item.tempId !== tempId),
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <StatusBadge variant={editingOrderId ? "warning" : "success"}>
            {editingOrderId ? "Edit draft" : "New draft"}
          </StatusBadge>
          <h3 className="mt-3 text-xl font-black">
            {editingOrderId ? "Update purchase order" : "Create purchase order"}
          </h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            Draft the supplier order first. After it is correct, mark it as
            ordered and receive stock when delivery arrives.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-muted-foreground transition hover:text-foreground"
        >
          <X className="h-4 w-4" />
          Close form
        </button>
      </div>

      <div className="mt-5 grid gap-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <SelectField
            label="Supplier"
            value={form.supplierId}
            onChange={(value) => onChange({ ...form, supplierId: value })}
            options={suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.name,
            }))}
          />

          <SelectField
            label="Delivery location"
            value={form.deliveryBranchId}
            onChange={(value) => onChange({ ...form, deliveryBranchId: value })}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />

          <InputField
            label="Expected delivery date"
            value={form.expectedDeliveryDate}
            onChange={(value) =>
              onChange({ ...form, expectedDeliveryDate: value })
            }
            type="date"
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-black">Products ordered</h4>
            <button
              type="button"
              onClick={addLine}
              className="rounded-2xl border border-border bg-background px-4 py-2 text-xs font-black text-foreground transition hover:border-primary/50"
            >
              Add product line
            </button>
          </div>

          {form.items.map((item, index) => (
            <div
              key={item.tempId}
              className="rounded-3xl border border-border bg-background p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusBadge variant="primary">
                  Product line {index + 1}
                </StatusBadge>

                {form.items.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeLine(item.tempId)}
                    className="rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-black text-danger"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <SelectField
                  label="Product"
                  value={item.itemId}
                  onChange={(value) =>
                    updateLine(item.tempId, { itemId: value })
                  }
                  options={products.map((product) => ({
                    value: product.id,
                    label: product.name,
                  }))}
                />
                <InputField
                  label="Quantity ordered"
                  value={item.quantityOrdered}
                  onChange={(value) =>
                    updateLine(item.tempId, { quantityOrdered: value })
                  }
                  type="number"
                  min="1"
                  required
                />
                <InputField
                  label="Expected unit cost"
                  value={item.expectedUnitCost}
                  onChange={(value) =>
                    updateLine(item.tempId, { expectedUnitCost: value })
                  }
                  type="number"
                  min="0"
                />
              </div>

              <div className="mt-4">
                <TextAreaField
                  label="Line note"
                  value={item.note}
                  onChange={(value) => updateLine(item.tempId, { note: value })}
                  placeholder="Specific product note"
                />
              </div>
            </div>
          ))}
        </div>

        <TextAreaField
          label="Order notes"
          value={form.notes}
          onChange={(value) => onChange({ ...form, notes: value })}
          placeholder="Supplier terms, delivery instruction, or order context"
        />

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          ) : null}
          {isSaving
            ? "Saving..."
            : editingOrderId
              ? "Save draft"
              : "Create draft"}
        </button>
      </div>
    </form>
  );
}

function PurchaseOrderCard({
  order,
  isOpening,
  isSelected,
  onOpen,
}: {
  order: PurchaseOrderSummaryView;
  isOpening: boolean;
  isSelected: boolean;
  onOpen: () => void;
}) {
  const progress = getOrderProgress({
    ordered: order.totalQuantityOrdered,
    received: order.totalQuantityReceived,
  });

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isOpening}
      className={[
        "rounded-[1.75rem] border bg-surface p-4 text-left shadow-card transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-wait disabled:opacity-70",
        isSelected ? "border-primary ring-2 ring-primary/15" : "border-border",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={order.status} />
        <StatusBadge variant="primary">{order.orderNumber}</StatusBadge>
      </div>

      <h3 className="mt-4 break-words text-lg font-black">
        {order.supplierName}
      </h3>

      <div className="mt-3 rounded-2xl border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-3 text-xs font-black">
          <span className="text-muted-foreground">Received progress</span>
          <span>{progress}%</span>
        </div>
        <ProgressBar value={progress} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniMetric label="Ordered" value={order.totalQuantityOrdered} />
        <MiniMetric label="Received" value={order.totalQuantityReceived} />
      </div>

      <div className="mt-3 grid gap-2">
        <DetailRow
          label="Delivery location"
          value={order.deliveryBranchName || "Not set"}
        />
        <DetailRow
          label="Expected total"
          value={money(order.expectedTotalCents)}
        />
      </div>
    </button>
  );
}

function PurchaseOrderCommandCenter({
  selectedOrder,
  branches,
  receiveForm,
  sendForm,
  cancelReason,
  isMarkingOrdered,
  isCancelling,
  isReceiving,
  sendingMethod,
  canUpdatePurchaseOrder,
  canMarkPurchaseOrderOrdered,
  canCancelPurchaseOrder,
  canReceivePurchaseOrder,
  canSendPurchaseOrder,
  onEdit,
  onMarkOrdered,
  onCancel,
  onReceive,
  onSend,
  onReceiveFormChange,
  onSendFormChange,
  onCancelReasonChange,
}: {
  selectedOrder: SelectedPurchaseOrder | null;
  branches: CurrentUserResponse["branches"];
  receiveForm: ReceiveForm;
  sendForm: SendForm;
  cancelReason: string;
  isMarkingOrdered: boolean;
  isCancelling: boolean;
  isReceiving: boolean;
  sendingMethod: "pdf_download" | "email" | "whatsapp" | "";
  canUpdatePurchaseOrder: boolean;
  canMarkPurchaseOrderOrdered: boolean;
  canCancelPurchaseOrder: boolean;
  canReceivePurchaseOrder: boolean;
  canSendPurchaseOrder: boolean;
  onEdit: () => void;
  onMarkOrdered: () => void;
  onCancel: () => void;
  onReceive: (event: FormEvent<HTMLFormElement>) => void;
  onSend: (method: "pdf_download" | "email" | "whatsapp") => void;
  onReceiveFormChange: (value: ReceiveForm) => void;
  onSendFormChange: (value: SendForm) => void;
  onCancelReasonChange: (value: string) => void;
}) {
  if (!selectedOrder) {
    return (
      <section className="min-h-[520px] rounded-section border border-dashed border-border bg-surface p-8 text-center shadow-card">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          <ClipboardList className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-black">Open a purchase order</h2>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-muted-foreground">
          Choose an order to review products, receive stock, and see send
          history.
        </p>
      </section>
    );
  }

  const order = selectedOrder.purchaseOrder;
  const totals = getSelectedOrderTotals(selectedOrder.items);
  const progress = getOrderProgress({
    ordered: totals.ordered,
    received: totals.received,
  });
  const canReceiveNow =
    order.status === "ordered" || order.status === "partly_received";
  const canChangeDraft = order.status === "draft";
  const canCancelNow = order.status === "draft" || order.status === "ordered";

  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
      <section className="overflow-hidden rounded-section border border-border bg-surface shadow-card">
        <div className="relative p-4 sm:p-5">
          <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl" />

          <div className="relative flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <StatusBadge variant="primary">{order.orderNumber}</StatusBadge>
          </div>

          <div className="relative mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <h3 className="break-words text-2xl font-black">
                {order.supplierName}
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
                {order.deliveryBranchName || "No delivery location selected"}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:min-w-[300px]">
              <MiniMetric label="Ordered" value={totals.ordered} />
              <MiniMetric label="Received" value={totals.received} />
              <MiniMetric label="Remaining" value={totals.remaining} />
            </div>
          </div>

          <div className="relative mt-5 rounded-3xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3 text-xs font-black">
              <span className="text-muted-foreground">Order progress</span>
              <span>{progress}% received</span>
            </div>
            <ProgressBar value={progress} />
          </div>

          <div className="relative mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {canChangeDraft && canUpdatePurchaseOrder ? (
              <ActionButton label="Edit draft" onClick={onEdit} />
            ) : null}

            {canChangeDraft && canMarkPurchaseOrderOrdered ? (
              <ActionButton
                label={isMarkingOrdered ? "Marking..." : "Mark ordered"}
                loading={isMarkingOrdered}
                primary
                onClick={onMarkOrdered}
              />
            ) : null}

            {canSendPurchaseOrder ? (
              <>
                <ActionButton
                  label={
                    sendingMethod === "whatsapp" ? "Opening..." : "WhatsApp"
                  }
                  loading={sendingMethod === "whatsapp"}
                  onClick={() => onSend("whatsapp")}
                />
                <ActionButton
                  label={
                    sendingMethod === "email" ? "Recording..." : "Email event"
                  }
                  loading={sendingMethod === "email"}
                  onClick={() => onSend("email")}
                />
                <ActionButton
                  label={
                    sendingMethod === "pdf_download"
                      ? "Recording..."
                      : "PDF event"
                  }
                  loading={sendingMethod === "pdf_download"}
                  onClick={() => onSend("pdf_download")}
                />
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
        <h4 className="text-lg font-black">Supplier details</h4>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <DetailRow
            label="Contact person"
            value={order.supplierContactPerson || "Not added"}
          />
          <DetailRow label="Phone" value={order.supplierPhone || "Not added"} />
          <DetailRow label="Email" value={order.supplierEmail || "Not added"} />
          <DetailRow
            label="Expected delivery"
            value={
              order.expectedDeliveryDate
                ? order.expectedDeliveryDate.slice(0, 10)
                : "Not set"
            }
          />
        </div>
      </section>

      <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
        <h4 className="text-lg font-black">Product progress</h4>

        <div className="mt-4 grid gap-3">
          {selectedOrder.items.map((item) => (
            <ProductProgressCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      {canReceiveNow && canReceivePurchaseOrder ? (
        <ReceiveStockCard
          selectedOrder={selectedOrder}
          branches={branches}
          receiveForm={receiveForm}
          isReceiving={isReceiving}
          onReceive={onReceive}
          onReceiveFormChange={onReceiveFormChange}
        />
      ) : null}

      {canSendPurchaseOrder ? (
        <SendShareCard
          sendForm={sendForm}
          sendingMethod={sendingMethod}
          onSend={onSend}
          onSendFormChange={onSendFormChange}
        />
      ) : null}

      <HistorySection
        receipts={selectedOrder.receipts}
        receiptItems={selectedOrder.receiptItems}
        sendEvents={selectedOrder.sendEvents}
      />

      {canCancelNow && canCancelPurchaseOrder ? (
        <section className="rounded-section border border-warning/25 bg-warning/10 p-4 shadow-card sm:p-5">
          <h4 className="text-lg font-black text-warning">
            Cancel purchase order
          </h4>
          <p className="mt-1 text-sm font-semibold leading-6 text-warning">
            Use this only when the supplier order should no longer be active.
          </p>

          <div className="mt-4">
            <TextAreaField
              label="Cancellation reason"
              value={cancelReason}
              onChange={onCancelReasonChange}
              required
            />
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isCancelling}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-warning px-4 py-3 text-sm font-black text-white shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCancelling ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : null}
            {isCancelling ? "Cancelling..." : "Cancel order"}
          </button>
        </section>
      ) : null}
    </aside>
  );
}

function ProductProgressCard({ item }: { item: PurchaseOrderItem }) {
  const progress = getOrderProgress({
    ordered: item.quantityOrdered,
    received: item.quantityReceived,
  });

  return (
    <article className="rounded-3xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h5 className="break-words text-sm font-black">{item.itemName}</h5>
          {item.itemSku ? (
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              {item.itemSku}
            </p>
          ) : null}
        </div>
        <StatusBadge
          variant={item.quantityRemaining === 0 ? "success" : "primary"}
        >
          {item.quantityRemaining === 0 ? "Complete" : "Open"}
        </StatusBadge>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs font-black">
          <span className="text-muted-foreground">Received</span>
          <span>{progress}%</span>
        </div>
        <ProgressBar value={progress} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniMetric label="Ordered" value={item.quantityOrdered} />
        <MiniMetric label="Received" value={item.quantityReceived} />
        <MiniMetric label="Left" value={item.quantityRemaining} />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <DetailRow
          label="Expected unit cost"
          value={
            item.expectedUnitCostCents === null
              ? "Not set"
              : money(item.expectedUnitCostCents)
          }
        />
        <DetailRow
          label="Expected total"
          value={
            item.expectedLineTotalCents === null
              ? "Not set"
              : money(item.expectedLineTotalCents)
          }
        />
      </div>
    </article>
  );
}

function ReceiveStockCard({
  selectedOrder,
  branches,
  receiveForm,
  isReceiving,
  onReceive,
  onReceiveFormChange,
}: {
  selectedOrder: SelectedPurchaseOrder;
  branches: CurrentUserResponse["branches"];
  receiveForm: ReceiveForm;
  isReceiving: boolean;
  onReceive: (event: FormEvent<HTMLFormElement>) => void;
  onReceiveFormChange: (value: ReceiveForm) => void;
}) {
  const openItems = selectedOrder.items.filter(
    (item) => item.quantityRemaining > 0,
  );

  return (
    <form
      onSubmit={onReceive}
      className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <StatusBadge variant="success">Receiving</StatusBadge>
          <h4 className="mt-3 text-lg font-black">Receive stock</h4>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
            Enter only the quantities that arrived in this delivery.
          </p>
        </div>
        <PackageCheck className="h-6 w-6 text-primary" />
      </div>

      <div className="mt-4 grid gap-4">
        <SelectField
          label="Receiving location"
          value={receiveForm.receivedBranchId}
          onChange={(value) =>
            onReceiveFormChange({
              ...receiveForm,
              receivedBranchId: value,
            })
          }
          options={branches.map((branch) => ({
            value: branch.id,
            label: branch.name,
          }))}
        />

        {openItems.map((item) => {
          const row = receiveForm.items[item.id] || {
            quantityReceived: "",
            actualUnitCost: "",
            note: "",
          };

          return (
            <div
              key={item.id}
              className="rounded-3xl border border-border bg-background p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h5 className="break-words text-sm font-black">
                  {item.itemName}
                </h5>
                <StatusBadge variant="primary">
                  {item.quantityRemaining.toLocaleString()} left
                </StatusBadge>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <InputField
                  label="Quantity received"
                  value={row.quantityReceived}
                  onChange={(value) =>
                    onReceiveFormChange({
                      ...receiveForm,
                      items: {
                        ...receiveForm.items,
                        [item.id]: {
                          ...row,
                          quantityReceived: value,
                        },
                      },
                    })
                  }
                  type="number"
                  min="0"
                />
                <InputField
                  label="Actual unit cost"
                  value={row.actualUnitCost}
                  onChange={(value) =>
                    onReceiveFormChange({
                      ...receiveForm,
                      items: {
                        ...receiveForm.items,
                        [item.id]: {
                          ...row,
                          actualUnitCost: value,
                        },
                      },
                    })
                  }
                  type="number"
                  min="0"
                />
              </div>

              <div className="mt-3">
                <TextAreaField
                  label="Receive note"
                  value={row.note}
                  onChange={(value) =>
                    onReceiveFormChange({
                      ...receiveForm,
                      items: {
                        ...receiveForm.items,
                        [item.id]: {
                          ...row,
                          note: value,
                        },
                      },
                    })
                  }
                />
              </div>
            </div>
          );
        })}

        <TextAreaField
          label="Delivery note"
          value={receiveForm.note}
          onChange={(value) =>
            onReceiveFormChange({ ...receiveForm, note: value })
          }
          placeholder="Delivery condition or receiving note"
        />

        <button
          type="submit"
          disabled={isReceiving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isReceiving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          ) : null}
          {isReceiving ? "Receiving stock..." : "Receive stock"}
        </button>
      </div>
    </form>
  );
}

function SendShareCard({
  sendForm,
  sendingMethod,
  onSend,
  onSendFormChange,
}: {
  sendForm: SendForm;
  sendingMethod: "pdf_download" | "email" | "whatsapp" | "";
  onSend: (method: "pdf_download" | "email" | "whatsapp") => void;
  onSendFormChange: (value: SendForm) => void;
}) {
  return (
    <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
      <h4 className="text-lg font-black">Send or share order</h4>
      <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
        Record how this purchase order was shared with the supplier.
      </p>

      <div className="mt-4 grid gap-3">
        <InputField
          label="Recipient name"
          value={sendForm.recipientName}
          onChange={(value) =>
            onSendFormChange({ ...sendForm, recipientName: value })
          }
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            label="Recipient email"
            value={sendForm.recipientEmail}
            onChange={(value) =>
              onSendFormChange({ ...sendForm, recipientEmail: value })
            }
            type="email"
          />
          <InputField
            label="Recipient phone"
            value={sendForm.recipientPhone}
            onChange={(value) =>
              onSendFormChange({ ...sendForm, recipientPhone: value })
            }
          />
        </div>
        <InputField
          label="Subject"
          value={sendForm.subject}
          onChange={(value) =>
            onSendFormChange({ ...sendForm, subject: value })
          }
        />
        <TextAreaField
          label="Message"
          value={sendForm.message}
          onChange={(value) =>
            onSendFormChange({ ...sendForm, message: value })
          }
          placeholder="Optional message to include or record"
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <SendButton
          label="PDF event"
          icon={FileText}
          isLoading={sendingMethod === "pdf_download"}
          onClick={() => onSend("pdf_download")}
        />
        <SendButton
          label="Email event"
          icon={Mail}
          isLoading={sendingMethod === "email"}
          onClick={() => onSend("email")}
        />
        <SendButton
          label="WhatsApp"
          icon={Send}
          isLoading={sendingMethod === "whatsapp"}
          onClick={() => onSend("whatsapp")}
        />
      </div>
    </section>
  );
}

function HistorySection({
  receipts,
  receiptItems,
  sendEvents,
}: {
  receipts: PurchaseOrderReceipt[];
  receiptItems: PurchaseOrderReceiptItem[];
  sendEvents: PurchaseOrderSendEvent[];
}) {
  return (
    <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
      <h4 className="text-lg font-black">Order activity</h4>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-sm font-black">Receipts</p>

          {receipts.length ? (
            <div className="mt-3 space-y-3">
              {receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="rounded-3xl border border-border bg-background p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge variant="success">
                      {receipt.receiptNumber}
                    </StatusBadge>
                    <StatusBadge variant="primary">
                      {receipt.receivedBranchName}
                    </StatusBadge>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <DetailRow
                      label="Received by"
                      value={receipt.receivedByName || "Not recorded"}
                    />
                    <DetailRow
                      label="Date"
                      value={new Date(receipt.receivedAt).toLocaleString()}
                    />
                  </div>

                  <div className="mt-3 space-y-2">
                    {receiptItems
                      .filter(
                        (item) => item.purchaseOrderReceiptId === receipt.id,
                      )
                      .map((item) => (
                        <DetailRow
                          key={item.id}
                          label={item.itemName}
                          value={`${item.quantityReceived.toLocaleString()} received`}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-2xl border border-border bg-background p-4 text-sm font-semibold text-muted-foreground">
              No stock has been received from this order yet.
            </p>
          )}
        </div>

        <div>
          <p className="text-sm font-black">Send history</p>

          {sendEvents.length ? (
            <div className="mt-3 space-y-3">
              {sendEvents.map((event) => (
                <div
                  key={event.id}
                  className="rounded-3xl border border-border bg-background p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge variant="primary">
                      {formatSendMethod(event.method)}
                    </StatusBadge>
                    <StatusBadge
                      variant={
                        event.status === "completed" ? "success" : "warning"
                      }
                    >
                      {formatSendStatus(event.status)}
                    </StatusBadge>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <DetailRow
                      label="Recipient"
                      value={
                        event.recipientName ||
                        event.recipientEmail ||
                        event.recipientPhone ||
                        "Not recorded"
                      }
                    />
                    <DetailRow
                      label="Recorded by"
                      value={event.sentByName || "Not recorded"}
                    />
                    <DetailRow
                      label="Date"
                      value={new Date(event.createdAt).toLocaleString()}
                    />
                    {event.failureReason ? (
                      <DetailRow label="Note" value={event.failureReason} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 rounded-2xl border border-border bg-background p-4 text-sm font-semibold text-muted-foreground">
              No send events recorded yet.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyPurchaseOrderState({
  search,
  canCreatePurchaseOrder,
  onCreate,
}: {
  search: string;
  canCreatePurchaseOrder: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="rounded-section border border-dashed border-border bg-surface p-8 text-center shadow-card">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        <Truck className="h-7 w-7" />
      </div>

      <h2 className="mt-4 text-xl font-black">
        {search.trim() ? "No purchase orders found" : "No purchase orders yet"}
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold leading-6 text-muted-foreground">
        {search.trim()
          ? "Try another supplier name, order number, or location."
          : "Create a supplier order before receiving stock from that supplier."}
      </p>

      {canCreatePurchaseOrder ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110"
        >
          Create purchase order
        </button>
      ) : null}
    </section>
  );
}

function PurchaseOrderSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.35fr)]">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-56 animate-pulse rounded-[1.75rem] border border-border bg-surface"
          />
        ))}
      </div>
      <div className="h-[520px] animate-pulse rounded-section border border-border bg-surface" />
    </div>
  );
}

function SendButton({
  label,
  icon: Icon,
  isLoading,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  isLoading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-foreground transition hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isLoading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {isLoading ? "Recording..." : label}
    </button>
  );
}

function ActionButton({
  label,
  loading,
  primary,
  onClick,
}: {
  label: string;
  loading?: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60",
        primary
          ? "bg-primary text-primary-foreground shadow-soft hover:brightness-110"
          : "border border-border bg-background text-foreground hover:border-primary/50",
      ].join(" ")}
    >
      {loading ? (
        <span
          className={[
            "h-4 w-4 animate-spin rounded-full border-2",
            primary
              ? "border-primary-foreground/30 border-t-primary-foreground"
              : "border-primary/30 border-t-primary",
          ].join(" ")}
        />
      ) : null}
      {label}
    </button>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-border bg-background p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black">{value.toLocaleString()}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-black">{value.toLocaleString()}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
        }}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      >
        <option value="">Choose</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  min,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        min={min}
        required={required}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        rows={4}
        className="mt-2 w-full resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      />
    </label>
  );
}

function AlertCard({
  tone,
  message,
}: {
  tone: "success" | "danger";
  message: string;
}) {
  return (
    <div
      className={[
        "rounded-panel border px-4 py-3 text-sm font-bold",
        tone === "success"
          ? "border-success/30 bg-success/10 text-success"
          : "border-danger/30 bg-danger/10 text-danger",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

function PermissionCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm font-bold text-warning">
      {message}
    </div>
  );
}

function OrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const labels: Record<PurchaseOrderStatus, string> = {
    draft: "Draft",
    ordered: "Ordered",
    partly_received: "Partly received",
    fully_received: "Fully received",
    cancelled: "Cancelled",
  };

  return (
    <StatusBadge
      variant={
        status === "fully_received"
          ? "success"
          : status === "cancelled"
            ? "warning"
            : "primary"
      }
    >
      {labels[status]}
    </StatusBadge>
  );
}

function buildPurchaseOrderPayload(form: PurchaseOrderForm) {
  const payload: Parameters<typeof createPurchaseOrder>[0] = {
    supplierId: form.supplierId,
    items: [],
  };

  if (form.deliveryBranchId) {
    payload.deliveryBranchId = form.deliveryBranchId;
  }

  if (form.expectedDeliveryDate) {
    payload.expectedDeliveryDate = form.expectedDeliveryDate;
  }

  const notes = form.notes.trim();

  if (notes) {
    payload.notes = notes;
  }

  payload.items = form.items
    .map((item) => {
      const quantityOrdered = toInt(item.quantityOrdered);

      if (!item.itemId || quantityOrdered <= 0) {
        return null;
      }

      const payloadItem: {
        itemId: string;
        quantityOrdered: number;
        expectedUnitCostCents?: number;
        note?: string;
      } = {
        itemId: item.itemId,
        quantityOrdered,
      };

      const expectedUnitCost = item.expectedUnitCost.trim();
      const note = item.note.trim();

      if (expectedUnitCost) {
        payloadItem.expectedUnitCostCents = toCents(expectedUnitCost);
      }

      if (note) {
        payloadItem.note = note;
      }

      return payloadItem;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return payload;
}

function buildReceiveItems(items: PurchaseOrderItem[]): ReceiveForm["items"] {
  const result: ReceiveForm["items"] = {};

  for (const item of items) {
    result[item.id] = {
      quantityReceived: "",
      actualUnitCost:
        item.expectedUnitCostCents === null
          ? ""
          : fromCents(item.expectedUnitCostCents),
      note: "",
    };
  }

  return result;
}

function getSelectedOrderTotals(items: PurchaseOrderItem[]) {
  return items.reduce(
    (result, item) => {
      result.ordered += item.quantityOrdered;
      result.received += item.quantityReceived;
      result.remaining += item.quantityRemaining;
      return result;
    },
    {
      ordered: 0,
      received: 0,
      remaining: 0,
    },
  );
}

function getOrderProgress({
  ordered,
  received,
}: {
  ordered: number;
  received: number;
}) {
  if (ordered <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((received / ordered) * 100));
}

function formatSendMethod(method: PurchaseOrderSendEvent["method"]) {
  const labels: Record<PurchaseOrderSendEvent["method"], string> = {
    pdf_download: "PDF event",
    email: "Email",
    whatsapp: "WhatsApp",
  };

  return labels[method];
}

function formatSendStatus(status: PurchaseOrderSendEvent["status"]) {
  const labels: Record<PurchaseOrderSendEvent["status"], string> = {
    completed: "Completed",
    failed: "Failed",
    not_configured: "Not configured",
  };

  return labels[status];
}

function toInt(value: string, fallback = 0) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.round(numberValue));
}

function toCents(value: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return Math.max(0, Math.round(numberValue * 100));
}

function fromCents(value: number | null) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(Math.round(value / 100));
}

function money(value: number) {
  return `${Math.round(value / 100).toLocaleString()} RWF`;
}

"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Banknote,
  CreditCard,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import { type CurrentUserResponse } from "../../lib/api";
import {
  closeCashDrawer,
  getCurrentCashDrawer,
  openCashDrawer,
  type CashDrawerSession,
} from "../../lib/cash-drawer-api";
import {
  createSale,
  getSale,
  listCustomers,
  listPosProducts,
  listSales,
  type Customer,
  type CreateSalePayload,
  type PosProduct,
  type SaleDetailResponse,
  type SalePaymentMethod,
  type SaleSummary,
} from "../../lib/sales-api";
import { StatusBadge } from "../status-badge";

type PosViewProps = {
  context: CurrentUserResponse;
};

type CartLine = {
  itemId: string;
  name: string;
  sku: string | null;
  quantity: number;
  unitPriceCents: number;
  availableQuantity: number;
};

type CustomerMode = "walk_in" | "existing" | "new";

const PAYMENT_METHODS: Array<{
  value: SalePaymentMethod;
  label: string;
}> = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
];

export function PosView({ context }: PosViewProps) {
  const accessibleBranches = context.branches.filter(
    (branch) => branch.status === "active",
  );
  const mainBranch = accessibleBranches.find((branch) => branch.is_main);
  const defaultBranchId = mainBranch?.id || accessibleBranches[0]?.id || "";

  const canCreateSale = context.membership.permissions.includes("SALE_CREATE");
  const canViewCashDrawer =
    context.membership.permissions.includes("CASH_SESSION_VIEW");
  const canOpenCashDrawer =
    context.membership.permissions.includes("CASH_SESSION_OPEN");
  const canCloseCashDrawer =
    context.membership.permissions.includes("CASH_SESSION_CLOSE");
  const isOwner =
    context.membership.memberType === "PRIMARY_OWNER" ||
    context.membership.memberType === "OWNER";

  const [selectedBranchId, setSelectedBranchId] = useState(defaultBranchId);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [recentSales, setRecentSales] = useState<SaleSummary[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  const [customerMode, setCustomerMode] = useState<CustomerMode>("walk_in");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("cash");
  const [saleNotes, setSaleNotes] = useState("");

  const [cashDrawerSession, setCashDrawerSession] =
    useState<CashDrawerSession | null>(null);
  const [cashDrawerBusinessDay, setCashDrawerBusinessDay] = useState("");
  const [isLoadingCashDrawer, setIsLoadingCashDrawer] = useState(true);
  const [isOpeningCashDrawer, setIsOpeningCashDrawer] = useState(false);
  const [isClosingCashDrawer, setIsClosingCashDrawer] = useState(false);
  const [openingCashRwf, setOpeningCashRwf] = useState("");
  const [openingCashNote, setOpeningCashNote] = useState("");
  const [countedCashRwf, setCountedCashRwf] = useState("");
  const [closingCashNote, setClosingCashNote] = useState("");
  const [differenceReason, setDifferenceReason] = useState("");
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const [lastSale, setLastSale] = useState<SaleDetailResponse | null>(null);
  const [selectedSale, setSelectedSale] = useState<SaleDetailResponse | null>(
    null,
  );
  const [selectedSaleSummary, setSelectedSaleSummary] =
    useState<SaleSummary | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSaleDetail, setIsLoadingSaleDetail] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const productsById = useMemo(() => {
    const result = new Map<string, PosProduct>();

    for (const product of products) {
      result.set(product.id, product);
    }

    return result;
  }, [products]);

  const productLimit = search.trim() ? 20 : 12;
  const visibleProducts = products;

  const filteredCustomers = useMemo(() => {
    const searchValue = customerSearch.trim().toLowerCase();

    if (!searchValue) {
      return customers.slice(0, 8);
    }

    return customers
      .filter((customer) =>
        `${customer.name} ${customer.phone || ""} ${customer.email || ""}`
          .toLowerCase()
          .includes(searchValue),
      )
      .slice(0, 8);
  }, [customers, customerSearch]);

  const selectedBranch = accessibleBranches.find(
    (branch) => branch.id === selectedBranchId,
  );

  const subtotalCents = cart.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceCents,
    0,
  );

  const cartQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const hasOversoldLine = cart.some(
    (line) => line.quantity > line.availableQuantity,
  );

  const isCashDrawerOpen = cashDrawerSession?.status === "open";
  const isCashDrawerClosedToday = cashDrawerSession?.status === "closed";
  const isCashDrawerBlocked = paymentMethod === "cash" && !isCashDrawerOpen;

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        void reloadPos();
      },
      search.trim() ? 250 : 0,
    );

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, search]);

  useEffect(() => {
    void reloadCashDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId]);

  async function reloadCashDrawer() {
    if (!selectedBranchId || !canViewCashDrawer) {
      setCashDrawerSession(null);
      setCashDrawerBusinessDay("");
      setIsLoadingCashDrawer(false);
      return;
    }

    setIsLoadingCashDrawer(true);

    try {
      const result = await getCurrentCashDrawer(selectedBranchId);
      const session = result.session;

      setCashDrawerSession(session);
      setCashDrawerBusinessDay(result.businessDay);

      if (session?.status === "open") {
        setCountedCashRwf(fromCents(session.expectedCashCents));
      } else if (
        session &&
        session.countedCashCents !== null &&
        session.countedCashCents !== undefined
      ) {
        setCountedCashRwf(fromCents(session.countedCashCents));
      } else {
        setCountedCashRwf("");
      }

      setOwnerOverride(false);
      setReopenReason("");
      setDifferenceReason("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load cash drawer.",
      );
    } finally {
      setIsLoadingCashDrawer(false);
    }
  }

  async function handleOpenCashDrawer() {
    if (!selectedBranchId) {
      setError("Choose a selling location before opening the cash drawer.");
      return;
    }

    if (!canOpenCashDrawer) {
      setError("You do not have access to open the cash drawer.");
      return;
    }

    if (isCashDrawerClosedToday && !ownerOverride) {
      setError(
        "This drawer is already closed for today. The owner can reopen it with a reason.",
      );
      return;
    }

    if (isCashDrawerClosedToday && ownerOverride && !reopenReason.trim()) {
      setError("Add a reason before reopening this cash drawer.");
      return;
    }

    const openingCashCents = toCents(openingCashRwf || "0");

    if (openingCashCents === null) {
      setError("Enter a valid opening cash amount.");
      return;
    }

    setError("");
    setSuccess("");
    setIsOpeningCashDrawer(true);

    try {
      const payload: Parameters<typeof openCashDrawer>[0] = {
        branchId: selectedBranchId,
        openingCashCents,
      };

      const note = openingCashNote.trim();

      if (note) {
        payload.note = note;
      }

      if (ownerOverride) {
        payload.ownerOverride = true;
        payload.reopenReason = reopenReason.trim();
      }

      const result = await openCashDrawer(payload);
      const openedSession = result.session;

      if (!openedSession) {
        throw new Error("Cash drawer was not opened. Please try again.");
      }

      setCashDrawerSession(openedSession);
      setCountedCashRwf(fromCents(openedSession.expectedCashCents));

      setOpeningCashRwf("");
      setOpeningCashNote("");
      setOwnerOverride(false);
      setReopenReason("");
      setSuccess(
        ownerOverride
          ? "Cash drawer reopened for this selling location."
          : "Cash drawer opened for this selling location.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not open cash drawer.",
      );
    } finally {
      setIsOpeningCashDrawer(false);
    }
  }

  async function handleCloseCashDrawer() {
    if (!selectedBranchId) {
      setError("Choose a selling location before closing the cash drawer.");
      return;
    }

    if (!canCloseCashDrawer) {
      setError("You do not have access to close the cash drawer.");
      return;
    }

    const countedCashCents = toCents(countedCashRwf);

    if (countedCashCents === null) {
      setError("Enter the counted cash amount.");
      return;
    }

    const expectedCashCents = cashDrawerSession?.expectedCashCents || 0;
    const differenceCents = countedCashCents - expectedCashCents;

    if (differenceCents !== 0 && !differenceReason.trim()) {
      setError(
        "Add a reason because the cash counted is different from the expected cash.",
      );
      return;
    }

    setError("");
    setSuccess("");
    setIsClosingCashDrawer(true);

    try {
      const payload: Parameters<typeof closeCashDrawer>[0] = {
        branchId: selectedBranchId,
        countedCashCents,
      };

      const note = closingCashNote.trim();
      const reason = differenceReason.trim();

      if (note) {
        payload.note = note;
      }

      if (reason) {
        payload.differenceReason = reason;
      }

      const result = await closeCashDrawer(payload);

      setCashDrawerSession(result.session);
      setCountedCashRwf(
        result.session?.countedCashCents !== null &&
          result.session?.countedCashCents !== undefined
          ? fromCents(result.session.countedCashCents)
          : "",
      );
      setClosingCashNote("");
      setDifferenceReason("");
      setSuccess(
        `Cash drawer closed. Difference: ${money(
          result.session?.differenceCents || 0,
        )}.`,
      );
      await reloadPos();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not close cash drawer.",
      );
    } finally {
      setIsClosingCashDrawer(false);
    }
  }

  async function reloadPos() {
    setIsLoading(true);
    setError("");

    try {
      const [productResult, customerResult, salesResult] = await Promise.all([
        listPosProducts({
          branchId: selectedBranchId,
          search,
          limit: productLimit,
        }),
        listCustomers({ status: "active" }),
        listSales({ branchId: selectedBranchId }),
      ]);

      setProducts(productResult.products);
      setCustomers(customerResult.customers);
      setRecentSales(salesResult.sales.slice(0, 10));

      setCart((current) =>
        current
          .map((line) => {
            const product = productResult.products.find(
              (row) => row.id === line.itemId,
            );
            const availableQuantity = product?.quantityAvailable || 0;

            return {
              ...line,
              availableQuantity,
              quantity: Math.min(line.quantity, Math.max(availableQuantity, 0)),
            };
          })
          .filter((line) => line.quantity > 0),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load POS details.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function addProduct(product: PosProduct) {
    const availableQuantity = product.quantityAvailable || 0;

    if (availableQuantity <= 0) {
      setError("This product has no stock available in the selected location.");
      return;
    }

    setError("");
    setSuccess("");
    setLastSale(null);

    setCart((current) => {
      const existing = current.find((line) => line.itemId === product.id);

      if (existing) {
        return current.map((line) =>
          line.itemId === product.id
            ? {
                ...line,
                quantity: Math.min(line.quantity + 1, availableQuantity),
                availableQuantity,
              }
            : line,
        );
      }

      return [
        ...current,
        {
          itemId: product.id,
          name: product.name,
          sku: product.sku || null,
          quantity: 1,
          unitPriceCents: product.sellingPriceCents,
          availableQuantity,
        },
      ];
    });
  }

  function updateLineQuantity(itemId: string, quantity: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.itemId === itemId
            ? {
                ...line,
                quantity: Math.min(
                  Math.max(0, quantity),
                  Math.max(line.availableQuantity, 0),
                ),
              }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function removeLine(itemId: string) {
    setCart((current) => current.filter((line) => line.itemId !== itemId));
  }

  function resetSale() {
    setCart([]);
    setCustomerMode("walk_in");
    setSelectedCustomerId("");
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerEmail("");
    setPaymentMethod("cash");
    setSaleNotes("");
  }

  async function openSaleDetail(sale: SaleSummary) {
    setError("");
    setSelectedSaleId(sale.id);
    setSelectedSaleSummary(sale);
    setSelectedSale(null);
    setIsLoadingSaleDetail(true);

    try {
      const result = await getSale(sale.id);
      setSelectedSale(result);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not load sale details.",
      );
    } finally {
      setIsLoadingSaleDetail(false);
    }
  }

  function closeSaleDetail() {
    setSelectedSaleId("");
    setSelectedSaleSummary(null);
    setSelectedSale(null);
    setIsLoadingSaleDetail(false);
  }

  async function handleConfirmSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateSale) {
      setError("You do not have access to create sales.");
      return;
    }

    if (!selectedBranchId) {
      setError("Choose a selling location.");
      return;
    }

    if (!cart.length) {
      setError("Add at least one product to the sale.");
      return;
    }

    if (hasOversoldLine) {
      setError("One or more products are above available stock.");
      return;
    }

    if (isCashDrawerBlocked) {
      setError(
        "Open the cash drawer before taking cash. Non-cash payments can continue without the drawer.",
      );
      return;
    }

    if (customerMode === "existing" && !selectedCustomerId) {
      setError("Choose the customer for this sale.");
      return;
    }

    if (customerMode === "new" && !newCustomerName.trim()) {
      setError("Add the customer name or use Walk-in customer.");
      return;
    }

    setIsConfirming(true);
    setError("");
    setSuccess("");

    try {
      const saleNotesValue = saleNotes.trim();

      const payment: CreateSalePayload["payments"][number] = {
        method: paymentMethod,
        amountCents: subtotalCents,
      };

      const payload: CreateSalePayload = {
        branchId: selectedBranchId,
        items: cart.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
        })),
        payments: [payment],
      };

      if (saleNotesValue) {
        payload.notes = saleNotesValue;
      }

      if (customerMode === "existing" && selectedCustomerId) {
        payload.customerId = selectedCustomerId;
      }

      if (customerMode === "new") {
        const customer: CreateSalePayload["customer"] = {
          name: newCustomerName.trim(),
        };

        const customerPhoneValue = newCustomerPhone.trim();
        const customerEmailValue = newCustomerEmail.trim();

        if (customerPhoneValue) {
          customer.phone = customerPhoneValue;
        }

        if (customerEmailValue) {
          customer.email = customerEmailValue;
        }

        payload.customer = customer;
      }

      const result = await createSale(payload);

      setLastSale(result);
      setSuccess(
        `Sale completed. Receipt ${result.sale.receiptNumber || "created"}.`,
      );
      resetSale();
      await Promise.all([reloadPos(), reloadCashDrawer()]);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not complete sale.",
      );
    } finally {
      setIsConfirming(false);
    }
  }

  if (!canCreateSale) {
    return (
      <section className="rounded-section border border-warning/25 bg-warning/10 p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-warning" />
          <div>
            <h2 className="text-xl font-black text-warning">
              Sales access needed
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-warning">
              You can sign in, but this account cannot create sales from POS.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <section className="overflow-hidden rounded-section border border-border bg-surface shadow-card">
        <div className="relative p-4 sm:p-5">
          <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative grid gap-5 xl:grid-cols-[1fr_auto] xl:items-center">
            <div>
              <StatusBadge variant="primary">Sales / POS</StatusBadge>
              <h1 className="mt-3 text-2xl font-black sm:text-3xl">
                Create a sale
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted-foreground">
                Choose the selling location, search products, record payment,
                and confirm the sale. Stock reduces only after confirmation.
              </p>
              <p className="mt-2 max-w-2xl text-xs font-bold leading-5 text-muted-foreground">
                Built for busy counters: search first, show only a focused set,
                and keep the cart visible on larger screens.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[620px] xl:grid-cols-4">
              <SummaryCard label="Cart items" value={cartQuantity} />
              <SummaryCard
                label="Products shown"
                value={visibleProducts.length}
              />
              <SummaryCard
                label="Cash drawer"
                value={isCashDrawerOpen ? "Open" : "Closed"}
              />
              <SummaryCard label="Sale total" value={money(subtotalCents)} />
            </div>
          </div>

          <div className="relative mt-5 grid gap-3 lg:grid-cols-[280px_1fr_190px]">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                Selling location
              </span>
              <select
                value={selectedBranchId}
                onChange={(event) => setSelectedBranchId(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
              >
                {accessibleBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                Search products
              </span>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-3">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name, code, or scan barcode"
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </div>
            </label>

            <button
              type="button"
              onClick={() => void reloadPos()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-foreground transition hover:border-primary/50 lg:self-end"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {error ? <AlertCard tone="danger" message={error} /> : null}
      {success ? <AlertCard tone="success" message={success} /> : null}

      {isLoading ? <PosSkeleton /> : null}

      {!isLoading ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <section className="space-y-4">
            <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">Fast product search</h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
                    Showing up to {productLimit} products for{" "}
                    {selectedBranch?.name || "the selected location"}. Best
                    sellers appear first, then recently sold products, then
                    product name.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge variant="primary">
                    {visibleProducts.length.toLocaleString()} shown
                  </StatusBadge>
                  <StatusBadge variant="warning">Search-first</StatusBadge>
                </div>
              </div>

              {visibleProducts.length ? (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {visibleProducts.map((product) => (
                      <ProductSaleCard
                        key={product.id}
                        product={product}
                        availableQuantity={product.quantityAvailable}
                        onAdd={() => addProduct(product)}
                      />
                    ))}
                  </div>

                  {visibleProducts.length >= productLimit ? (
                    <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">
                      Search by name, product code, or barcode to narrow a large
                      catalog without slowing the counter.
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="mt-4 rounded-3xl border border-dashed border-border bg-background p-8 text-center">
                  <PackageCheck className="mx-auto h-8 w-8 text-muted-foreground" />
                  <h3 className="mt-3 text-base font-black">
                    No products found
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-muted-foreground">
                    Try another product name or check stock in this selling
                    location.
                  </p>
                </div>
              )}
            </section>

            {lastSale ? <ReceiptSummary result={lastSale} /> : null}

            <RecentSalesCard
              sales={recentSales}
              onOpenSale={(sale) => void openSaleDetail(sale)}
            />
          </section>

          <form
            onSubmit={handleConfirmSale}
            className="space-y-4 xl:sticky xl:top-4 xl:self-start"
          >
            <CartCard
              cart={cart}
              subtotalCents={subtotalCents}
              onUpdateQuantity={updateLineQuantity}
              onRemove={removeLine}
            />

            <CustomerCard
              customerMode={customerMode}
              customers={filteredCustomers}
              customerSearch={customerSearch}
              selectedCustomerId={selectedCustomerId}
              newCustomerName={newCustomerName}
              newCustomerPhone={newCustomerPhone}
              newCustomerEmail={newCustomerEmail}
              onCustomerModeChange={setCustomerMode}
              onCustomerSearchChange={setCustomerSearch}
              onSelectedCustomerChange={setSelectedCustomerId}
              onNewCustomerNameChange={setNewCustomerName}
              onNewCustomerPhoneChange={setNewCustomerPhone}
              onNewCustomerEmailChange={setNewCustomerEmail}
            />

            <PaymentCard
              paymentMethod={paymentMethod}
              saleNotes={saleNotes}
              totalCents={subtotalCents}
              cashDrawerSession={cashDrawerSession}
              cashDrawerBusinessDay={cashDrawerBusinessDay}
              selectedBranchName={
                selectedBranch?.name || "this selling location"
              }
              isOwner={isOwner}
              canOpenCashDrawer={canOpenCashDrawer}
              canCloseCashDrawer={canCloseCashDrawer}
              isLoadingCashDrawer={isLoadingCashDrawer}
              isOpeningCashDrawer={isOpeningCashDrawer}
              isClosingCashDrawer={isClosingCashDrawer}
              openingCashRwf={openingCashRwf}
              openingCashNote={openingCashNote}
              countedCashRwf={countedCashRwf}
              closingCashNote={closingCashNote}
              differenceReason={differenceReason}
              ownerOverride={ownerOverride}
              reopenReason={reopenReason}
              isConfirming={isConfirming}
              isDisabled={
                !cart.length || hasOversoldLine || isCashDrawerBlocked
              }
              onPaymentMethodChange={setPaymentMethod}
              onSaleNotesChange={setSaleNotes}
              onOpeningCashRwfChange={setOpeningCashRwf}
              onOpeningCashNoteChange={setOpeningCashNote}
              onCountedCashRwfChange={setCountedCashRwf}
              onClosingCashNoteChange={setClosingCashNote}
              onDifferenceReasonChange={setDifferenceReason}
              onOwnerOverrideChange={setOwnerOverride}
              onReopenReasonChange={setReopenReason}
              onOpenCashDrawer={() => void handleOpenCashDrawer()}
              onCloseCashDrawer={() => void handleCloseCashDrawer()}
              onRefreshCashDrawer={() => void reloadCashDrawer()}
            />
          </form>
        </section>
      ) : null}

      {selectedSaleId ? (
        <SaleDetailDrawer
          detail={selectedSale}
          summary={selectedSaleSummary}
          isLoading={isLoadingSaleDetail}
          onClose={closeSaleDetail}
        />
      ) : null}
    </section>
  );
}

function ProductSaleCard({
  product,
  availableQuantity,
  onAdd,
}: {
  product: PosProduct;
  availableQuantity: number;
  onAdd: () => void;
}) {
  const isAvailable = availableQuantity > 0;

  return (
    <article className="min-w-0 rounded-3xl border border-border bg-background p-4 transition hover:border-primary/35 hover:shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="break-words text-base font-black">{product.name}</h3>
          {product.sku ? (
            <p className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
              {product.sku}
            </p>
          ) : null}
          {product.soldQuantity30Days > 0 ? (
            <p className="mt-2 text-xs font-bold text-primary">
              Sold {product.soldQuantity30Days.toLocaleString()} in 30 days
            </p>
          ) : null}
        </div>
        <StatusBadge variant={isAvailable ? "success" : "warning"}>
          {isAvailable ? "Available" : "No stock"}
        </StatusBadge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric
          label="Available"
          value={availableQuantity.toLocaleString()}
        />
        <MiniMetric label="Price" value={money(product.sellingPriceCents)} />
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={!isAvailable}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        {isAvailable ? "Add to sale" : "No stock here"}
      </button>
    </article>
  );
}

function CartCard({
  cart,
  subtotalCents,
  onUpdateQuantity,
  onRemove,
}: {
  cart: CartLine[];
  subtotalCents: number;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}) {
  return (
    <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Sale cart</h2>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Confirm products before recording payment.
          </p>
        </div>
        <ShoppingCart className="h-6 w-6 text-primary" />
      </div>

      {cart.length ? (
        <div className="mt-4 space-y-3">
          {cart.map((line) => {
            const isMaxed = line.quantity >= line.availableQuantity;

            return (
              <article
                key={line.itemId}
                className="rounded-3xl border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-black">
                      {line.name}
                    </h3>
                    {line.sku ? (
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                        {line.sku}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(line.itemId)}
                    className="rounded-2xl border border-danger/25 bg-danger/10 p-2 text-danger"
                    aria-label="Remove product"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <MiniMetric
                    label="Unit price"
                    value={money(line.unitPriceCents)}
                  />
                  <MiniMetric
                    label="Line total"
                    value={money(line.unitPriceCents * line.quantity)}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateQuantity(line.itemId, line.quantity - 1)
                    }
                    className="rounded-xl border border-border bg-background p-2"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="text-center">
                    <p className="text-lg font-black">
                      {line.quantity.toLocaleString()}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {line.availableQuantity.toLocaleString()} available
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateQuantity(line.itemId, line.quantity + 1)
                    }
                    disabled={isMaxed}
                    className="rounded-xl border border-border bg-background p-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}

          <div className="rounded-3xl border border-primary/20 bg-primary/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
              Total to pay
            </p>
            <p className="mt-2 text-2xl font-black">{money(subtotalCents)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-border bg-background p-6 text-center">
          <ShoppingCart className="mx-auto h-7 w-7 text-muted-foreground" />
          <h3 className="mt-3 text-base font-black">Cart is empty</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            Add products from the list to start a sale.
          </p>
        </div>
      )}
    </section>
  );
}

function CustomerCard({
  customerMode,
  customers,
  customerSearch,
  selectedCustomerId,
  newCustomerName,
  newCustomerPhone,
  newCustomerEmail,
  onCustomerModeChange,
  onCustomerSearchChange,
  onSelectedCustomerChange,
  onNewCustomerNameChange,
  onNewCustomerPhoneChange,
  onNewCustomerEmailChange,
}: {
  customerMode: CustomerMode;
  customers: Customer[];
  customerSearch: string;
  selectedCustomerId: string;
  newCustomerName: string;
  newCustomerPhone: string;
  newCustomerEmail: string;
  onCustomerModeChange: (value: CustomerMode) => void;
  onCustomerSearchChange: (value: string) => void;
  onSelectedCustomerChange: (value: string) => void;
  onNewCustomerNameChange: (value: string) => void;
  onNewCustomerPhoneChange: (value: string) => void;
  onNewCustomerEmailChange: (value: string) => void;
}) {
  return (
    <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Customer</h2>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Optional for quick walk-in sales.
          </p>
        </div>
        <UserPlus className="h-6 w-6 text-primary" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { key: "walk_in" as const, label: "Walk-in" },
          { key: "existing" as const, label: "Existing" },
          { key: "new" as const, label: "New" },
        ].map((mode) => {
          const isActive = mode.key === customerMode;

          return (
            <button
              key={mode.key}
              type="button"
              onClick={() => onCustomerModeChange(mode.key)}
              className={[
                "rounded-2xl border px-3 py-2 text-xs font-black transition",
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-soft"
                  : "border-border bg-background text-foreground hover:border-primary/50",
              ].join(" ")}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {customerMode === "existing" ? (
        <div className="mt-4 space-y-3">
          <input
            value={customerSearch}
            onChange={(event) => onCustomerSearchChange(event.target.value)}
            placeholder="Search customer"
            className="w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
          />
          <select
            value={selectedCustomerId}
            onChange={(event) => onSelectedCustomerChange(event.target.value)}
            className="w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
          >
            <option value="">Choose customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.phone ? ` — ${customer.phone}` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {customerMode === "new" ? (
        <div className="mt-4 grid gap-3">
          <InputField
            label="Customer name"
            value={newCustomerName}
            onChange={onNewCustomerNameChange}
          />
          <InputField
            label="Phone"
            value={newCustomerPhone}
            onChange={onNewCustomerPhoneChange}
          />
          <InputField
            label="Email"
            value={newCustomerEmail}
            onChange={onNewCustomerEmailChange}
            type="email"
          />
        </div>
      ) : null}
    </section>
  );
}

function PaymentCard({
  paymentMethod,
  saleNotes,
  totalCents,
  cashDrawerSession,
  cashDrawerBusinessDay,
  selectedBranchName,
  isOwner,
  canOpenCashDrawer,
  canCloseCashDrawer,
  isLoadingCashDrawer,
  isOpeningCashDrawer,
  isClosingCashDrawer,
  openingCashRwf,
  openingCashNote,
  countedCashRwf,
  closingCashNote,
  differenceReason,
  ownerOverride,
  reopenReason,
  isConfirming,
  isDisabled,
  onPaymentMethodChange,
  onSaleNotesChange,
  onOpeningCashRwfChange,
  onOpeningCashNoteChange,
  onCountedCashRwfChange,
  onClosingCashNoteChange,
  onDifferenceReasonChange,
  onOwnerOverrideChange,
  onReopenReasonChange,
  onOpenCashDrawer,
  onCloseCashDrawer,
  onRefreshCashDrawer,
}: {
  paymentMethod: SalePaymentMethod;
  saleNotes: string;
  totalCents: number;
  cashDrawerSession: CashDrawerSession | null;
  cashDrawerBusinessDay: string;
  selectedBranchName: string;
  isOwner: boolean;
  canOpenCashDrawer: boolean;
  canCloseCashDrawer: boolean;
  isLoadingCashDrawer: boolean;
  isOpeningCashDrawer: boolean;
  isClosingCashDrawer: boolean;
  openingCashRwf: string;
  openingCashNote: string;
  countedCashRwf: string;
  closingCashNote: string;
  differenceReason: string;
  ownerOverride: boolean;
  reopenReason: string;
  isConfirming: boolean;
  isDisabled: boolean;
  onPaymentMethodChange: (value: SalePaymentMethod) => void;
  onSaleNotesChange: (value: string) => void;
  onOpeningCashRwfChange: (value: string) => void;
  onOpeningCashNoteChange: (value: string) => void;
  onCountedCashRwfChange: (value: string) => void;
  onClosingCashNoteChange: (value: string) => void;
  onDifferenceReasonChange: (value: string) => void;
  onOwnerOverrideChange: (value: boolean) => void;
  onReopenReasonChange: (value: string) => void;
  onOpenCashDrawer: () => void;
  onCloseCashDrawer: () => void;
  onRefreshCashDrawer: () => void;
}) {
  return (
    <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Payment</h2>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Choose how the customer paid. Rurix uses the receipt number as the
            sale reference automatically.
          </p>
        </div>
        <CreditCard className="h-6 w-6 text-primary" />
      </div>

      <div className="mt-4 grid gap-3">
        <div>
          <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            Payment method
          </span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((method) => {
              const isActive = method.value === paymentMethod;

              return (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => onPaymentMethodChange(method.value)}
                  className={[
                    "rounded-2xl border px-3 py-3 text-sm font-black transition",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground shadow-soft"
                      : "border-border bg-background text-foreground hover:border-primary/50",
                  ].join(" ")}
                >
                  {method.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-background p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            Payment reference
          </p>
          <p className="mt-2 text-sm font-bold leading-6 text-foreground">
            Created automatically after confirmation using the receipt number.
          </p>
        </div>

        <CashDrawerPaymentPanel
          paymentMethod={paymentMethod}
          session={cashDrawerSession}
          businessDay={cashDrawerBusinessDay}
          selectedBranchName={selectedBranchName}
          isOwner={isOwner}
          canOpen={canOpenCashDrawer}
          canClose={canCloseCashDrawer}
          isLoading={isLoadingCashDrawer}
          isOpening={isOpeningCashDrawer}
          isClosing={isClosingCashDrawer}
          openingCashRwf={openingCashRwf}
          openingCashNote={openingCashNote}
          countedCashRwf={countedCashRwf}
          closingCashNote={closingCashNote}
          differenceReason={differenceReason}
          ownerOverride={ownerOverride}
          reopenReason={reopenReason}
          onOpeningCashRwfChange={onOpeningCashRwfChange}
          onOpeningCashNoteChange={onOpeningCashNoteChange}
          onCountedCashRwfChange={onCountedCashRwfChange}
          onClosingCashNoteChange={onClosingCashNoteChange}
          onDifferenceReasonChange={onDifferenceReasonChange}
          onOwnerOverrideChange={onOwnerOverrideChange}
          onReopenReasonChange={onReopenReasonChange}
          onOpenCashDrawer={onOpenCashDrawer}
          onCloseCashDrawer={onCloseCashDrawer}
          onRefreshCashDrawer={onRefreshCashDrawer}
        />

        <TextAreaField
          label="Sale note"
          value={saleNotes}
          onChange={onSaleNotesChange}
          placeholder="Optional note for this sale"
        />

        <div className="rounded-3xl border border-primary/20 bg-primary/10 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            Amount to record
          </p>
          <p className="mt-2 text-2xl font-black">{money(totalCents)}</p>
        </div>

        <button
          type="submit"
          disabled={isConfirming || isDisabled}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isConfirming ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
          ) : (
            <ReceiptText className="h-4 w-4" />
          )}
          {isConfirming ? "Completing sale..." : "Confirm sale"}
        </button>
      </div>
    </section>
  );
}

function CashDrawerPaymentPanel({
  paymentMethod,
  session,
  businessDay,
  selectedBranchName,
  isOwner,
  canOpen,
  canClose,
  isLoading,
  isOpening,
  isClosing,
  openingCashRwf,
  openingCashNote,
  countedCashRwf,
  closingCashNote,
  differenceReason,
  ownerOverride,
  reopenReason,
  onOpeningCashRwfChange,
  onOpeningCashNoteChange,
  onCountedCashRwfChange,
  onClosingCashNoteChange,
  onDifferenceReasonChange,
  onOwnerOverrideChange,
  onReopenReasonChange,
  onOpenCashDrawer,
  onCloseCashDrawer,
  onRefreshCashDrawer,
}: {
  paymentMethod: SalePaymentMethod;
  session: CashDrawerSession | null;
  businessDay: string;
  selectedBranchName: string;
  isOwner: boolean;
  canOpen: boolean;
  canClose: boolean;
  isLoading: boolean;
  isOpening: boolean;
  isClosing: boolean;
  openingCashRwf: string;
  openingCashNote: string;
  countedCashRwf: string;
  closingCashNote: string;
  differenceReason: string;
  ownerOverride: boolean;
  reopenReason: string;
  onOpeningCashRwfChange: (value: string) => void;
  onOpeningCashNoteChange: (value: string) => void;
  onCountedCashRwfChange: (value: string) => void;
  onClosingCashNoteChange: (value: string) => void;
  onDifferenceReasonChange: (value: string) => void;
  onOwnerOverrideChange: (value: boolean) => void;
  onReopenReasonChange: (value: string) => void;
  onOpenCashDrawer: () => void;
  onCloseCashDrawer: () => void;
  onRefreshCashDrawer: () => void;
}) {
  if (paymentMethod !== "cash") {
    return (
      <section className="rounded-3xl border border-border bg-background p-4">
        <div className="flex items-start gap-3">
          <Banknote className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-black">Cash drawer not used</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
              This payment method does not touch the cash drawer. The sale can
              continue even when the drawer is closed.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-border bg-background p-4">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <p className="text-sm font-black">Checking cash drawer...</p>
        </div>
      </section>
    );
  }

  if (!session || session.status === "closed") {
    const isClosedToday = session?.status === "closed";

    return (
      <section className="rounded-3xl border border-warning/25 bg-warning/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <StatusBadge variant="warning">
              {isClosedToday ? "Closed for today" : "Cash drawer closed"}
            </StatusBadge>
            <h3 className="mt-3 text-base font-black text-warning">
              {isClosedToday
                ? "Drawer was already closed today"
                : "Open drawer before taking cash"}
            </h3>
            <p className="mt-1 text-sm font-semibold leading-6 text-warning">
              {isClosedToday
                ? "This location can normally open a new drawer tomorrow. The owner can reopen today with a reason."
                : `Cash sales are blocked until a drawer is opened for ${selectedBranchName}.`}
            </p>
            {businessDay ? (
              <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-warning">
                Business day: {businessDay}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onRefreshCashDrawer}
            className="rounded-2xl border border-warning/30 bg-background px-3 py-2 text-xs font-black text-warning"
          >
            Refresh
          </button>
        </div>

        {session?.differenceCents !== null &&
        session?.differenceCents !== undefined ? (
          <div className="mt-4 rounded-2xl border border-warning/25 bg-background p-3">
            <DetailRow
              label="Last difference"
              value={money(session.differenceCents)}
            />
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          {!isClosedToday ? (
            <>
              <InputField
                label="Opening cash"
                value={openingCashRwf}
                onChange={onOpeningCashRwfChange}
                type="number"
                placeholder="Example: 50000"
              />
              <TextAreaField
                label="Opening note"
                value={openingCashNote}
                onChange={onOpeningCashNoteChange}
                placeholder="Optional note"
              />
            </>
          ) : null}

          {isClosedToday ? (
            <div className="rounded-3xl border border-warning/25 bg-background p-4">
              {isOwner ? (
                <>
                  <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-3 py-3 text-sm font-black">
                    <span>Owner override</span>
                    <input
                      type="checkbox"
                      checked={ownerOverride}
                      onChange={(event) =>
                        onOwnerOverrideChange(event.target.checked)
                      }
                    />
                  </label>

                  {ownerOverride ? (
                    <div className="mt-3">
                      <TextAreaField
                        label="Reopen reason"
                        value={reopenReason}
                        onChange={onReopenReasonChange}
                        placeholder="Explain why this drawer must be reopened today"
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm font-bold leading-6 text-warning">
                  Ask the owner if this drawer must be reopened today.
                </p>
              )}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onOpenCashDrawer}
            disabled={
              isOpening ||
              !canOpen ||
              (isClosedToday && (!isOwner || !ownerOverride))
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-warning px-4 py-3 text-sm font-black text-warning-foreground shadow-soft transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isOpening ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-warning-foreground/30 border-t-warning-foreground" />
            ) : isClosedToday ? (
              <RotateCcw className="h-4 w-4" />
            ) : (
              <Banknote className="h-4 w-4" />
            )}
            {isOpening
              ? "Opening drawer..."
              : isClosedToday
                ? "Reopen drawer"
                : "Open cash drawer"}
          </button>
        </div>
      </section>
    );
  }

  const parsedCountedCash = toCents(countedCashRwf);
  const differencePreview =
    parsedCountedCash === null
      ? null
      : parsedCountedCash - session.expectedCashCents;
  const needsDifferenceReason =
    differencePreview !== null && differencePreview !== 0;

  return (
    <section className="rounded-3xl border border-success/25 bg-success/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge variant="success">Cash drawer open</StatusBadge>
          <h3 className="mt-3 text-base font-black text-success">
            Cash sales can continue
          </h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-success">
            Cash collected will be added to this drawer automatically.
          </p>
          <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-success">
            Business day: {session.businessDay || businessDay}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefreshCashDrawer}
          className="rounded-2xl border border-success/30 bg-background px-3 py-2 text-xs font-black text-success"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric
          label="Opening cash"
          value={money(session.openingCashCents)}
        />
        <MiniMetric
          label="Expected cash"
          value={money(session.expectedCashCents)}
        />
        <MiniMetric
          label="Opened by"
          value={session.openedByName || "Not shown"}
        />
        <MiniMetric label="Location" value={session.branchName} />
      </div>

      <div className="mt-4 rounded-3xl border border-border bg-background p-4">
        <div className="flex items-start gap-3">
          <Banknote className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-black">Close drawer</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
              Close only after counting the physical cash in the drawer.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <InputField
            label="Cash counted"
            value={countedCashRwf}
            onChange={onCountedCashRwfChange}
            type="number"
            placeholder="Physical cash counted"
          />

          {differencePreview !== null ? (
            <div
              className={[
                "rounded-2xl border p-3",
                differencePreview === 0
                  ? "border-success/25 bg-success/10 text-success"
                  : "border-warning/25 bg-warning/10 text-warning",
              ].join(" ")}
            >
              <DetailRow
                label="Difference preview"
                value={money(differencePreview)}
              />
              <p className="mt-2 text-sm font-bold leading-6">
                {differencePreview === 0
                  ? "Cash counted matches expected cash."
                  : differencePreview > 0
                    ? "Cash counted is above expected. Add a reason before closing."
                    : "Cash counted is below expected. Add a reason before closing."}
              </p>
            </div>
          ) : null}

          {needsDifferenceReason ? (
            <TextAreaField
              label="Reason for difference"
              value={differenceReason}
              onChange={onDifferenceReasonChange}
              placeholder="Explain why cash counted is above or below expected"
            />
          ) : null}

          <TextAreaField
            label="Closing note"
            value={closingCashNote}
            onChange={onClosingCashNoteChange}
            placeholder="Optional note"
          />

          <button
            type="button"
            onClick={onCloseCashDrawer}
            disabled={isClosing || !canClose}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-black text-foreground shadow-soft transition hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isClosing ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            ) : (
              <Banknote className="h-4 w-4" />
            )}
            {isClosing ? "Closing drawer..." : "Close cash drawer"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ReceiptSummary({ result }: { result: SaleDetailResponse }) {
  return (
    <section className="rounded-section border border-success/25 bg-success/10 p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge variant="success">Sale completed</StatusBadge>
          <h2 className="mt-3 text-xl font-black text-success">
            Receipt{" "}
            {result.sale.receiptNumber ||
              result.receipt?.receiptNumber ||
              "created"}
          </h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-success">
            Stock was reduced from {result.sale.branchName} and the sale was
            saved.
          </p>
        </div>
        <ReceiptText className="h-7 w-7 text-success" />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <DetailRow label="Sale number" value={result.sale.saleNumber} />
        <DetailRow
          label="Customer"
          value={result.sale.customerName || "Walk-in customer"}
        />
        <DetailRow label="Total paid" value={money(result.sale.paidCents)} />
      </div>

      <div className="mt-4 rounded-3xl border border-success/20 bg-background p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          Products sold
        </p>
        <div className="mt-2 grid gap-2">
          {result.items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-border bg-surface p-3"
            >
              <p className="text-sm font-black">{item.itemName}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <MiniMetric
                  label="Quantity"
                  value={item.quantity.toLocaleString()}
                />
                <MiniMetric
                  label="Line total"
                  value={money(item.lineTotalCents)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PosSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-52 animate-pulse rounded-3xl border border-border bg-surface"
          />
        ))}
      </div>
      <div className="h-[620px] animate-pulse rounded-section border border-border bg-surface" />
    </div>
  );
}

function RecentSalesCard({
  sales,
  onOpenSale,
}: {
  sales: SaleSummary[];
  onOpenSale: (sale: SaleSummary) => void;
}) {
  return (
    <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Recent sales</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
            Latest sales for the selected selling location. Open any sale to
            review the full receipt trail.
          </p>
        </div>
        <StatusBadge variant="primary">
          {sales.length.toLocaleString()} shown
        </StatusBadge>
      </div>

      {sales.length ? (
        <div className="mt-4 grid gap-3">
          {sales.map((sale) => (
            <button
              key={sale.id}
              type="button"
              onClick={() => onOpenSale(sale)}
              className="w-full rounded-3xl border border-border bg-background p-4 text-left transition hover:border-primary/40 hover:shadow-soft"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-black">
                    {sale.receiptNumber || sale.saleNumber}
                  </p>
                  <p className="mt-1 text-xs font-bold text-muted-foreground">
                    {sale.customerName || "Walk-in customer"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black">{money(sale.totalCents)}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                    View details
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <MiniMetric
                  label="Products"
                  value={sale.itemCount.toLocaleString()}
                />
                <MiniMetric label="Paid" value={money(sale.paidCents)} />
                <MiniMetric label="Location" value={sale.branchName} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-border bg-background p-6 text-center">
          <ReceiptText className="mx-auto h-7 w-7 text-muted-foreground" />
          <h3 className="mt-3 text-base font-black">No sales here yet</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
            Completed sales for this location will appear here.
          </p>
        </div>
      )}
    </section>
  );
}

function SaleDetailDrawer({
  detail,
  summary,
  isLoading,
  onClose,
}: {
  detail: SaleDetailResponse | null;
  summary: SaleSummary | null;
  isLoading: boolean;
  onClose: () => void;
}) {
  const receiptNumber =
    detail?.sale.receiptNumber ||
    detail?.receipt?.receiptNumber ||
    summary?.receiptNumber ||
    summary?.saleNumber ||
    "Sale details";

  const saleNumber =
    detail?.sale.saleNumber || summary?.saleNumber || "Loading";
  const customerName =
    detail?.sale.customerName || summary?.customerName || "Walk-in customer";
  const branchName =
    detail?.sale.branchName || summary?.branchName || "Selling location";
  const totalCents = detail?.sale.totalCents ?? summary?.totalCents ?? 0;
  const paidCents = detail?.sale.paidCents ?? summary?.paidCents ?? 0;
  const balanceCents = detail?.sale.balanceCents ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 p-2 backdrop-blur-sm sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close sale details"
        onClick={onClose}
      />

      <aside className="rurix-scrollbar relative flex h-full w-full max-w-xl flex-col overflow-y-auto rounded-[1.4rem] border border-border bg-background shadow-card">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{receiptNumber}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-muted-foreground">
              {customerName} · {money(totalCents)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-2xl border border-border bg-surface p-2 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            aria-label="Close sale details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <section className="rounded-section border border-border bg-surface p-4 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <StatusBadge
                  variant={balanceCents === 0 ? "success" : "warning"}
                >
                  {balanceCents === 0 ? "Fully paid" : "Balance due"}
                </StatusBadge>
                <h2 className="mt-3 break-words text-xl font-black">
                  {saleNumber}
                </h2>
              </div>
              {isLoading ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-2 text-xs font-black text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  Loading
                </span>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailRow label="Receipt" value={receiptNumber} />
              <DetailRow label="Selling location" value={branchName} />
              <DetailRow label="Customer" value={customerName} />
              <DetailRow
                label="Handled by"
                value={detail?.sale.createdByName || "Not shown yet"}
              />
              <DetailRow
                label="Completed"
                value={
                  detail?.sale.completedAt
                    ? formatDateTime(detail.sale.completedAt)
                    : "Loading"
                }
              />
              <DetailRow label="Total" value={money(totalCents)} />
            </div>
          </section>

          {!detail ? <SaleDetailSkeleton /> : null}

          {detail ? (
            <>
              <section className="rounded-section border border-border bg-surface p-4 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black">Products sold</h3>
                    <p className="mt-1 text-sm font-semibold text-muted-foreground">
                      Products that reduced stock on this sale.
                    </p>
                  </div>
                  <StatusBadge variant="primary">
                    {detail.items.length.toLocaleString()} products
                  </StatusBadge>
                </div>

                <div className="mt-4 grid gap-3">
                  {detail.items.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-3xl border border-border bg-background p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-black">
                            {item.itemName}
                          </p>
                          {item.itemSku ? (
                            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                              {item.itemSku}
                            </p>
                          ) : null}
                        </div>
                        <p className="text-sm font-black">
                          {money(item.lineTotalCents)}
                        </p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <MiniMetric
                          label="Quantity"
                          value={item.quantity.toLocaleString()}
                        />
                        <MiniMetric
                          label="Unit price"
                          value={money(item.unitPriceCents)}
                        />
                        <MiniMetric
                          label="Line total"
                          value={money(item.lineTotalCents)}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded-section border border-border bg-surface p-4 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-black">Payment</h3>
                    <p className="mt-1 text-sm font-semibold text-muted-foreground">
                      Payment record saved with this receipt.
                    </p>
                  </div>
                  <StatusBadge
                    variant={
                      detail.sale.balanceCents === 0 ? "success" : "warning"
                    }
                  >
                    {detail.sale.balanceCents === 0
                      ? "Fully paid"
                      : "Balance due"}
                  </StatusBadge>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <DetailRow
                    label="Total"
                    value={money(detail.sale.totalCents)}
                  />
                  <DetailRow
                    label="Paid"
                    value={money(detail.sale.paidCents)}
                  />
                  <DetailRow
                    label="Balance"
                    value={money(detail.sale.balanceCents)}
                  />
                </div>

                <div className="mt-4 grid gap-3">
                  {detail.payments.map((payment) => (
                    <article
                      key={payment.id}
                      className="rounded-3xl border border-border bg-background p-4"
                    >
                      <div className="grid gap-2 sm:grid-cols-3">
                        <MiniMetric
                          label="Method"
                          value={formatPaymentMethod(payment.method)}
                        />
                        <MiniMetric
                          label="Amount"
                          value={money(payment.amountCents)}
                        />
                        <MiniMetric
                          label="Received by"
                          value={payment.receivedByName || "Not shown"}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function SaleDetailSkeleton() {
  return (
    <div className="space-y-4">
      <section className="rounded-section border border-border bg-surface p-4 shadow-soft">
        <div className="h-4 w-36 animate-pulse rounded-full bg-muted" />
        <div className="mt-4 grid gap-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-3xl border border-border bg-background"
            />
          ))}
        </div>
      </section>

      <section className="rounded-section border border-border bg-surface p-4 shadow-soft">
        <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
        <div className="mt-4 h-28 animate-pulse rounded-3xl border border-border bg-background" />
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="min-w-0 rounded-3xl border border-border bg-background p-3 sm:p-4">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">
        {label}
      </p>
      <p className="mt-2 truncate text-lg font-black sm:text-xl">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-background p-3">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-black">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-background p-3">
      <p className="truncate text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black leading-5">{value}</p>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
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
        placeholder={placeholder}
        className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm font-bold outline-none focus:border-primary"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        placeholder={placeholder}
        rows={3}
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

function formatPaymentMethod(method: SalePaymentMethod) {
  const labels: Record<SalePaymentMethod, string> = {
    cash: "Cash",
    mobile_money: "Mobile money",
    bank_transfer: "Bank transfer",
    card: "Card",
  };

  return labels[method];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toCents(value: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return Math.round(numberValue * 100);
}

function fromCents(value: number) {
  return String(Math.round(value / 100));
}

function money(value: number) {
  return `${Math.round(value / 100).toLocaleString()} RWF`;
}

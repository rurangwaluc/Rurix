"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CreditCard,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";

import { type CurrentUserResponse } from "../../lib/api";
import { type CashDrawerSession } from "../../lib/cash-drawer-api";
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
import { CashDrawerPanel } from "./cash-drawer-panel";
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

const DEFAULT_PRODUCT_LIMIT = 12;
const SEARCH_PRODUCT_LIMIT = 20;
const DEFAULT_SALES_VISIBLE_COUNT = 5;
const SALES_PAGE_SIZE = 5;

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
  const [saleSearch, setSaleSearch] = useState("");
  const [visibleSalesCount, setVisibleSalesCount] = useState(
    DEFAULT_SALES_VISIBLE_COUNT,
  );

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [sales, setSales] = useState<SaleSummary[]>([]);
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

  const productLimit = search.trim()
    ? SEARCH_PRODUCT_LIMIT
    : DEFAULT_PRODUCT_LIMIT;

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

  const filteredSales = useMemo(() => {
    const searchValue = saleSearch.trim().toLowerCase();

    if (!searchValue) {
      return sales;
    }

    return sales.filter((sale) =>
      [
        sale.saleNumber,
        sale.receiptNumber || "",
        sale.customerName || "Walk-in customer",
        sale.branchName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchValue),
    );
  }, [sales, saleSearch]);

  const visibleSales = filteredSales.slice(0, visibleSalesCount);
  const hasMoreSales = filteredSales.length > visibleSales.length;

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
  const isCashDrawerBlocked = paymentMethod === "cash" && !isCashDrawerOpen;

  useEffect(() => {
    setVisibleSalesCount(DEFAULT_SALES_VISIBLE_COUNT);
  }, [selectedBranchId, saleSearch]);

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
      setSales(salesResult.sales);

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
      await reloadPos();
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
                Built for busy counters: show 12 products by default, 20 during
                search, and keep the cart visible on larger screens.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[620px] xl:grid-cols-4">
              <SummaryCard label="Cart items" value={cartQuantity} />
              <SummaryCard label="Products shown" value={products.length} />
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
                onChange={(event) => {
                  setSelectedBranchId(event.target.value);
                  setCashDrawerSession(null);
                }}
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
            <ProductSearchPanel
              products={products}
              productLimit={productLimit}
              selectedBranchName={
                selectedBranch?.name || "the selected location"
              }
              onAddProduct={addProduct}
            />

            {lastSale ? <ReceiptSummary result={lastSale} /> : null}

            <SalesHistoryCard
              sales={visibleSales}
              totalSales={filteredSales.length}
              showing={visibleSales.length}
              saleSearch={saleSearch}
              hasMoreSales={hasMoreSales}
              onSaleSearchChange={setSaleSearch}
              onLoadMore={() =>
                setVisibleSalesCount((current) => current + SALES_PAGE_SIZE)
              }
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
              selectedBranchId={selectedBranchId}
              isOwner={isOwner}
              canViewCashDrawer={canViewCashDrawer}
              canOpenCashDrawer={canOpenCashDrawer}
              canCloseCashDrawer={canCloseCashDrawer}
              isConfirming={isConfirming}
              isDisabled={
                !cart.length || hasOversoldLine || isCashDrawerBlocked
              }
              onPaymentMethodChange={setPaymentMethod}
              onSaleNotesChange={setSaleNotes}
              onDrawerChanged={setCashDrawerSession}
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

function ProductSearchPanel({
  products,
  productLimit,
  selectedBranchName,
  onAddProduct,
}: {
  products: PosProduct[];
  productLimit: number;
  selectedBranchName: string;
  onAddProduct: (product: PosProduct) => void;
}) {
  return (
    <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Fast product search</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
            Showing up to {productLimit} products for {selectedBranchName}. Best
            sellers appear first, then recently sold products, then product
            name.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant="primary">
            {products.length.toLocaleString()} shown
          </StatusBadge>
          <StatusBadge variant="warning">Search-first</StatusBadge>
        </div>
      </div>

      {products.length ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {products.map((product) => (
              <ProductSaleCard
                key={product.id}
                product={product}
                availableQuantity={product.quantityAvailable}
                onAdd={() => onAddProduct(product)}
              />
            ))}
          </div>

          {products.length >= productLimit ? (
            <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-bold text-primary">
              Search by name, product code, or barcode to narrow a large catalog
              without slowing the counter.
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-border bg-background p-8 text-center">
          <PackageCheck className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 text-base font-black">No products found</h3>
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-muted-foreground">
            Try another product name or check stock in this selling location.
          </p>
        </div>
      )}
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
  selectedBranchId,
  isOwner,
  canViewCashDrawer,
  canOpenCashDrawer,
  canCloseCashDrawer,
  isConfirming,
  isDisabled,
  onPaymentMethodChange,
  onSaleNotesChange,
  onDrawerChanged,
}: {
  paymentMethod: SalePaymentMethod;
  saleNotes: string;
  totalCents: number;
  selectedBranchId: string;
  isOwner: boolean;
  canViewCashDrawer: boolean;
  canOpenCashDrawer: boolean;
  canCloseCashDrawer: boolean;
  isConfirming: boolean;
  isDisabled: boolean;
  onPaymentMethodChange: (value: SalePaymentMethod) => void;
  onSaleNotesChange: (value: string) => void;
  onDrawerChanged: (session: CashDrawerSession | null) => void;
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

        <CashDrawerPanel
          branchId={selectedBranchId}
          paymentMethod={paymentMethod}
          canOpen={canOpenCashDrawer}
          canClose={canCloseCashDrawer}
          canView={canViewCashDrawer}
          isOwner={isOwner}
          onDrawerChanged={onDrawerChanged}
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

function SalesHistoryCard({
  sales,
  totalSales,
  showing,
  saleSearch,
  hasMoreSales,
  onSaleSearchChange,
  onLoadMore,
  onOpenSale,
}: {
  sales: SaleSummary[];
  totalSales: number;
  showing: number;
  saleSearch: string;
  hasMoreSales: boolean;
  onSaleSearchChange: (value: string) => void;
  onLoadMore: () => void;
  onOpenSale: (sale: SaleSummary) => void;
}) {
  return (
    <section className="rounded-section border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Sales history</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted-foreground">
            Showing the latest sales first. Search by receipt, sale number, or
            customer when the list grows.
          </p>
        </div>
        <StatusBadge variant="primary">
          {showing.toLocaleString()} of {totalSales.toLocaleString()}
        </StatusBadge>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
          Search sales
        </span>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={saleSearch}
            onChange={(event) => onSaleSearchChange(event.target.value)}
            placeholder="Receipt, sale number, or customer"
            className="w-full bg-transparent text-sm font-bold outline-none"
          />
        </div>
      </label>

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

          {hasMoreSales ? (
            <button
              type="button"
              onClick={onLoadMore}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black text-foreground transition hover:border-primary/50"
            >
              Load more sales
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-border bg-background p-6 text-center">
          <ReceiptText className="mx-auto h-7 w-7 text-muted-foreground" />
          <h3 className="mt-3 text-base font-black">No sales found</h3>
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
        <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black">{receiptNumber}</p>
            <p className="mt-0.5 truncate text-xs font-bold text-muted-foreground">
              {customerName} — {money(totalCents)}
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
              <DetailRow label="Paid" value={money(paidCents)} />
              <DetailRow label="Balance" value={money(balanceCents)} />
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
                      Payment records saved with this receipt.
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

function money(value: number) {
  return `${Math.round(value / 100).toLocaleString()} RWF`;
}

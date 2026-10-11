using TechTill.Domain.Common;
using TechTill.Domain.Enums;

namespace TechTill.Domain.Entities;

public class SalesInvoice : AuditableEntity
{
    public string InvoiceNo { get; set; } = string.Empty;
    public long ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public long CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public DateTime InvoiceDate { get; set; }
    public decimal SubTotal { get; set; }
    public decimal Discount { get; set; }
    public decimal Total { get; set; }
    public decimal PaidAmount { get; set; }
    public PaymentMethod PaymentMethod { get; set; } = PaymentMethod.Cash;
    public InvoiceStatus Status { get; set; } = InvoiceStatus.Unpaid;
    public DateTime? VoidedAt { get; set; }
    public string? VoidedBy { get; set; }
    public string? VoidReason { get; set; }
    public string? Note { get; set; }

    public ICollection<SalesItem> Items { get; set; } = [];
    public decimal Outstanding => Status == InvoiceStatus.Void ? 0m : Total - PaidAmount;
}

public class SalesItem
{
    public long Id { get; set; }
    public long SalesInvoiceId { get; set; }
    public SalesInvoice SalesInvoice { get; set; } = null!;
    public long ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public int Qty { get; set; }
    public decimal UnitPrice { get; set; }

    /// <summary>Product cost captured at the time of sale so COGS stays stable.</summary>
    public decimal UnitCost { get; set; }
    public decimal LineTotal => Qty * UnitPrice;
}

public class CustomerPayment : AuditableEntity
{
    public long ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public long CustomerId { get; set; }
    public Customer Customer { get; set; } = null!;
    public long? SalesInvoiceId { get; set; }
    public SalesInvoice? SalesInvoice { get; set; }
    public DateTime ReceivedAt { get; set; }
    public decimal Amount { get; set; }
    public PaymentMethod Method { get; set; } = PaymentMethod.Cash;
    public string? Note { get; set; }
}

public class ExpenseCategory : AuditableEntity
{
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

public class Expense : AuditableEntity
{
    public long ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public long ExpenseCategoryId { get; set; }
    public ExpenseCategory ExpenseCategory { get; set; } = null!;
    public DateTime ExpenseDate { get; set; }
    public decimal Amount { get; set; }
    public PaymentMethod Method { get; set; } = PaymentMethod.Cash;
    public string? Note { get; set; }
}

public class PettyCashEntry : AuditableEntity
{
    public long ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public DateTime EntryDate { get; set; }
    public PettyCashDirection Direction { get; set; }
    public decimal Amount { get; set; }
    public long? ExpenseId { get; set; }
    public Expense? Expense { get; set; }
    public string? Note { get; set; }

    /// <summary>
    /// True when the row mirrors a cash movement already stored elsewhere (a cash sale, a
    /// cash receipt, a supplier payment or a cash expense). Reports read cash from the
    /// primary tables, so these rows are excluded there and only shown in the drawer view.
    /// </summary>
    public bool IsSystemGenerated { get; set; }
}

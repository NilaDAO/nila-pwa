# Nila PWA Documentation

**Version:** 0.2.0
**Last Updated:** February 11, 2026
**Platform:** React 19 Progressive Web Application

---

## Welcome

This documentation provides a comprehensive guide to the Nila PWA, a blockchain-enabled Progressive Web Application designed for agricultural financing and land management in India. The application targets farmers and union members with low digital literacy, providing accessible financial services through mobile-first design.

---

## Quick Navigation

### For Executives & Stakeholders
Start here for high-level overviews and strategic insights:
- [State of the Application](01-Executive/State-of-the-Application.md) - Comprehensive status report
- [Executive Summary](01-Executive/Executive-Summary.md) - Quick overview (2-3 pages)
- [Roadmap and Priorities](01-Executive/Roadmap-and-Priorities.md) - Strategic planning

### For Developers
Start here to begin working with the codebase:
- [Getting Started](06-Developer-Guide/Getting-Started.md) - Setup and installation
- [System Overview](02-Architecture/System-Overview.md) - Architecture fundamentals
- [Custom Hooks Reference](06-Developer-Guide/Custom-Hooks-Reference.md) - Hook API documentation

### For Designers & UX Researchers
Start here for design and accessibility guidelines:
- [Accessibility Guidelines](08-UI-UX-Documentation/Accessibility-Guidelines.md) - Low-literacy design patterns
- [Design System](08-UI-UX-Documentation/Design-System.md) - Colors, typography, components
- [Touch Interaction Patterns](08-UI-UX-Documentation/Touch-Interaction-Patterns.md) - Gesture guidelines

### For Product Managers
Start here to understand features and user flows:
- [Feature Overview](03-Features/Feature-Overview.md) - All features at a glance
- [User Journey Maps](05-User-Workflows/User-Journey-Maps.md) - Visual user flows
- [Known Issues](10-Issues-and-Improvements/Known-Issues.md) - Current bugs and limitations

---

## Documentation Structure

### 📋 01-Executive
High-level reports and strategic documentation for leadership.

| Document | Description |
|----------|-------------|
| [State of the Application](01-Executive/State-of-the-Application.md) | Comprehensive technical and UX assessment with issues by severity |
| [Executive Summary](01-Executive/Executive-Summary.md) | 2-3 page overview for stakeholders |
| [Roadmap and Priorities](01-Executive/Roadmap-and-Priorities.md) | Strategic planning and prioritization framework |

### 🏗️ 02-Architecture
Technical architecture and system design documentation.

| Document | Description |
|----------|-------------|
| [System Overview](02-Architecture/System-Overview.md) | High-level architecture with diagrams |
| [Technology Stack](02-Architecture/Technology-Stack.md) | Dependencies, versions, and rationale |
| [State Management](02-Architecture/State-Management.md) | Context providers and React Query patterns |
| [Offline-First Strategy](02-Architecture/Offline-First-Strategy.md) | PWA caching, IndexedDB, service workers |

### ✨ 03-Features
Feature-by-feature documentation with implementation details.

| Document | Description |
|----------|-------------|
| [Feature Overview](03-Features/Feature-Overview.md) | Summary of all features |
| [Wallet Management](03-Features/Wallet-Management.md) | Asset management and balances |
| [Lending and Investments](03-Features/Lending-and-Investments.md) | Union funds and direct lending |
| [Field Registration](03-Features/Field-Registration.md) | GPS-based land mapping |
| [Grant System](03-Features/Grant-System.md) | Monthly token distribution |

### ⛓️ 04-Blockchain-Integration
Smart contract architecture and blockchain interaction patterns.

| Document | Description |
|----------|-------------|
| [Smart Contracts Overview](04-Blockchain-Integration/Smart-Contracts-Overview.md) | Contract architecture and relationships |
| [Contract Addresses and ABIs](04-Blockchain-Integration/Contract-Addresses-and-ABIs.md) | Deployment addresses by network |
| [Transaction Flows](04-Blockchain-Integration/Transaction-Flows.md) | Common transaction patterns |

### 👥 05-User-Workflows
User journey maps and workflow documentation.

| Document | Description |
|----------|-------------|
| [User Journey Maps](05-User-Workflows/User-Journey-Maps.md) | Visual user flow diagrams |
| [Registration and Recovery](05-User-Workflows/Registration-and-Recovery.md) | Onboarding process |
| [Field Registration Flow](05-User-Workflows/Field-Registration-Flow.md) | GPS land mapping workflow |

### 💻 06-Developer-Guide
Developer setup, coding standards, and best practices.

| Document | Description |
|----------|-------------|
| [Getting Started](06-Developer-Guide/Getting-Started.md) | Setup and running locally |
| [Custom Hooks Reference](06-Developer-Guide/Custom-Hooks-Reference.md) | Hook API documentation |
| [Testing Guide](06-Developer-Guide/Testing-Guide.md) | Testing strategy and examples |

### 🔌 07-API-Reference
API documentation for services and data layers.

| Document | Description |
|----------|-------------|
| [Cognito Authentication](07-API-Reference/Cognito-Authentication.md) | AWS Cognito integration |
| [IndexedDB Schema](07-API-Reference/IndexedDB-Schema.md) | Local storage structure |
| [Blockchain API Calls](07-API-Reference/Blockchain-API-Calls.md) | ethers.js patterns |

### 🎨 08-UI-UX-Documentation
Design system and user experience guidelines.

| Document | Description |
|----------|-------------|
| [Design System](08-UI-UX-Documentation/Design-System.md) | Colors, typography, spacing |
| [Accessibility Guidelines](08-UI-UX-Documentation/Accessibility-Guidelines.md) | Low-digital-capability design patterns |
| [Touch Interaction Patterns](08-UI-UX-Documentation/Touch-Interaction-Patterns.md) | Gesture and touch guidelines |

### 🚀 09-Deployment
Build and deployment procedures.

| Document | Description |
|----------|-------------|
| [Build Process](09-Deployment/Build-Process.md) | react-app-rewired, workbox configuration |
| [Environment Variables](09-Deployment/Environment-Variables.md) | Configuration management |

### 🔧 10-Issues-and-Improvements
Known issues, technical debt, and improvement plans.

| Document | Description |
|----------|-------------|
| [Known Issues](10-Issues-and-Improvements/Known-Issues.md) | Current bugs and limitations |
| [Technical Debt](10-Issues-and-Improvements/Technical-Debt.md) | Code quality improvements needed |
| [Performance Optimization](10-Issues-and-Improvements/Performance-Optimization.md) | Identified performance bottlenecks |

---

## Key Features

### Financial Services
- **Wallet Management**: ERC20 tokens (nIN, USDC, USDT) and ERC1155 certificates
- **Grant System**: Monthly token distributions from unions
- **Lending**: Union-managed investment funds with junior/senior tranches
- **Debt Tracking**: Loan management with harvest-based repayment

### Land Management
- **Field Registration**: GPS-based boundary mapping with AI detection
- **Land Title NFTs**: Blockchain-verified ownership certificates
- **Crop Tokenization**: ERC1155 tokens representing cultivations

### Technology Highlights
- **Offline-First**: Full functionality without internet connectivity
- **Phone Authentication**: AWS Cognito with SMS OTP
- **Blockchain Integration**: Polygon (mainnet + Amoy testnet)
- **Progressive Web App**: Installable, app-like experience

---

## Getting Help

### For Technical Issues
- Check [Known Issues](10-Issues-and-Improvements/Known-Issues.md)
- Review [Getting Started](06-Developer-Guide/Getting-Started.md) troubleshooting section
- Check the [GitHub repository issues](https://github.com/your-repo/issues)

### For UX/Design Questions
- Review [Accessibility Guidelines](08-UI-UX-Documentation/Accessibility-Guidelines.md)
- Check [Design System](08-UI-UX-Documentation/Design-System.md)
- See [Touch Interaction Patterns](08-UI-UX-Documentation/Touch-Interaction-Patterns.md)

### For Feature Requests
- Review [Roadmap and Priorities](01-Executive/Roadmap-and-Priorities.md)
- Submit proposals to the product team

---

## Document Conventions

### Severity Indicators
Throughout the documentation, you'll see these severity indicators:
- 🔴 **CRITICAL**: Must fix immediately (security, data loss, blocker)
- 🟠 **HIGH**: Address soon (poor UX, significant bug)
- 🟡 **MEDIUM**: Plan and prioritize (tech debt, maintainability)
- 🟢 **LOW**: Nice to have (polish, minor improvements)
- ⚪ **VERY LOW**: Future consideration (non-urgent enhancements)

### Code Examples
All code examples include:
- Language identifier for syntax highlighting
- Context comments explaining the purpose
- Complete, runnable code when possible

### File References
File paths are provided with clickable links when relevant:
- Example: [src/App.js:30](../src/App.js#L30)

---

## Contributing to Documentation

### Updating Documentation
- Keep docs in sync with code changes
- Update version numbers and dates
- Maintain consistent formatting (see style guide below)

### Style Guidelines
1. **Active voice**: "The system validates..." not "Validation is performed..."
2. **Scannable**: Use bullet points, tables, headings generously
3. **Code examples**: Include working code snippets
4. **Visual aids**: Add diagrams and screenshots where helpful

### Document Ownership
- **Technical Lead**: Architecture, blockchain docs
- **UX Designer**: User workflows, accessibility
- **Product Manager**: Executive summary, roadmap
- **Dev Team**: Developer guides, API reference

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.2.0 | Feb 2026 | Initial documentation created |

---

## License

Copyright © 2026 NilaDAO. All rights reserved.

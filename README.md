### About DoOrderBook V1-Core

These smart contracts constitute the core of The DeOrderBook Protocol —  a breakthrough protocol designed for the creation, exchange, and exercise of trustless option-like instruments, without reliance on oracles.

The codebase is organised as follows:

- `/governance` — contains the "GovernorBravo" style of Governance contracts developed by Compound, modified to work with the `$DOB` token.
- `/interfaces` — contains several interfaces to standardise several of our contracts
- `/libraries` — contains the TransferHelper library developed by Uniswap
- `/mock` — contains mock contracts to aid with our testing suite
- `/option` — contain all contracts related to our protocol settings, option factory, and our implementation of optionality
- `/staking` — contain our protocol's version of staking contracts which are time-sensitive as well as the staking contract for our `$DOB` token.
- `/token` — contains our implementations of the tokens needed for the protocol to function, including our implementation of tokenised options and `$DOB`.

### Contributing

If you have a suggestion that would make this codebase better, please fork the repo and create a pull request.

1. Fork the Project
2. Create your Branch (`git checkout -b feature/#xxx-amazing-feature`)
3. Commit your Changes (`git commit -m 'solves #xxx  — Add Amazing Feature'`)
4. Push to the Branch (`git push origin feature/#xxx-amazing-feature`)
5. Open a Pull Request (mention the Issue being solved in the description, if any)

Contributions are welcome from everyone, everywhere, all at once!

### License

Our code is source-available but proprietary, see `LICENSE.md` for details.
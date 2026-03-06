// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NilaLandTitle is ERC721, ERC721Enumerable, ERC721URIStorage, Ownable {
    uint256 private _tokenIds;

    // Mapping for whitelisted addresses
    mapping(address => bool) private _whitelist;

    // Mapping for title names
    mapping(uint256 => string) private _titleNames;

    // Events for title names
    event TitleNameSet(uint256 indexed tokenId, string titleName);
    event TitleNameUpdated(uint256 indexed tokenId, string oldTitleName, string newTitleName);
    
    constructor() ERC721("NilaLandTitle", "LAND") Ownable(msg.sender) {}

    // Add an address to the whitelist (only owner)
    function addToWhitelist(address signer) public onlyOwner {
        _whitelist[signer] = true;
    }

    // Remove an address from the whitelist (only owner)
    function removeFromWhitelist(address signer) public onlyOwner {
        _whitelist[signer] = false;
    }

    // Check if an address is whitelisted
    function isWhitelisted(address signer) public view returns (bool) {
        return _whitelist[signer];
    }

    // Mint and send NFT with metadata (requires whitelisted signature)
    function mintAndSend(
        address to,
        string memory metadata,
        string memory titleName, // New parameter
        bytes memory signature
    ) public {
        require(to != address(0), "Invalid recipient address");

        // Recover the signer from the signature
        bytes32 messageHash = keccak256(abi.encodePacked(to, metadata));
        bytes32 ethSignedMessageHash = _getEthSignedMessageHash(messageHash);
        address signer = _recoverSigner(ethSignedMessageHash, signature);

        require(_whitelist[signer], "Signer is not whitelisted");

        _tokenIds++;
        uint256 tokenId = _tokenIds;
        _titleNames[tokenId] = titleName;

        _mint(to, tokenId);
        _setTokenURI(tokenId, metadata);

        emit TitleNameSet(tokenId, titleName);
    }

    // Helper to get the Ethereum signed message hash
    function _getEthSignedMessageHash(bytes32 messageHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
    }

    // Helper to recover the signer from a signature
    function _recoverSigner(bytes32 ethSignedMessageHash, bytes memory signature) internal pure returns (address) {
        (bytes32 r, bytes32 s, uint8 v) = _splitSignature(signature);
        return ecrecover(ethSignedMessageHash, v, r, s);
    }
    /**
     * @dev Retrieves the title name associated with a specific `tokenId`.
     *
     * @param tokenId The ID of the token.
     * @return The title name associated with the `tokenId`.
     *
     * Note:
     * - Without the `_exists` check, calling this function with a non-existent `tokenId`
     *   will return an empty string.
     */
    function getTitleName(uint256 tokenId) public view returns (string memory) {
        return _titleNames[tokenId];
    }
    /**
     * @dev Updates the title name of a specific token.
     * Can only be called by the contract owner.
     *
     * Emits a {TitleNameUpdated} event.
     *
     * @param tokenId The ID of the token to update.
     * @param newTitleName The new title name to associate with the token.
     */
    function updateTitleName(uint256 tokenId, string memory newTitleName) public onlyOwner {
        string memory oldTitleName = _titleNames[tokenId];
        _titleNames[tokenId] = newTitleName;

        emit TitleNameUpdated(tokenId, oldTitleName, newTitleName);
    }

    // Helper to split a signature into its components
    function _splitSignature(bytes memory sig)
        internal
        pure
        returns (
            bytes32 r,
            bytes32 s,
            uint8 v
        )
    {
        require(sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    // Required overrides for multiple inheritance conflicts

    function _increaseBalance(address account, uint128 value) internal virtual override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function _update(address to, uint256 tokenId, address auth) internal virtual override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId) 
        public 
        view 
        virtual 
        override(ERC721, ERC721URIStorage) 
        returns (string memory) 
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        virtual 
        override(ERC721, ERC721Enumerable,ERC721URIStorage) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }
}